/**
 * Minimap component - Shows a 2D overview of the graph with current viewport highlighted
 * 
 * Features:
 * - Displays community clusters as colored dots
 * - Highlights current camera viewport with a semi-transparent rectangle
 * - Click to jump camera to that position
 * - Drag viewport indicator to pan camera
 * - Updates at 5Hz (200ms) for performance
 * - Toggle visibility with keyboard shortcut (M key)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { CommunityResult } from '../utils/communityDetection';
import { useMobileDetect } from '../hooks/useMobileDetect';

interface MinimapProps {
    /** Current camera position in 3D space */
    cameraPosition?: { x: number; y: number; z: number };
    /** Community detection result for cluster visualization */
    communityResult?: CommunityResult | null;
    /** All graph nodes with positions */
    nodes?: Array<{ id: string; x?: number; y?: number; z?: number }>;
    /** Callback to move camera to a new position */
    onCameraMove?: (position: { x: number; y: number; z: number }) => void;
    /** Size in pixels (defaults to 200) */
    size?: number;
}

const DEFAULT_SIZE = 200;
const UPDATE_INTERVAL_MS = 200; // 5Hz update rate
const VIEWPORT_INDICATOR_COLOR = 'rgba(255, 255, 255, 0.3)';
const VIEWPORT_INDICATOR_STROKE = 'rgba(255, 255, 255, 0.6)';
const COMMUNITY_DOT_SIZE = 3;

export default function Minimap({
    cameraPosition,
    communityResult,
    nodes = [],
    onCameraMove,
    size = DEFAULT_SIZE,
}: MinimapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isVisible, setIsVisible] = useState(true);
    const [isDragging, setIsDragging] = useState(false);
    const updateTimerRef = useRef<number | null>(null);
    const lastRenderDataRef = useRef<{
        cameraPos?: { x: number; y: number; z: number };
        nodes: Array<{ id: string; x?: number; y?: number; z?: number }>;
    }>({ nodes: [] });
    const { isMobile } = useMobileDetect();

    // Toggle visibility with M key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                // Don't toggle if user is typing in an input
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                    return;
                }
                
                e.preventDefault();
                setIsVisible(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Calculate bounds of all nodes
    const calculateBounds = useCallback(() => {
        if (nodes.length === 0) {
            return { minX: -100, maxX: 100, minY: -100, maxY: 100, minZ: -100, maxZ: 100 };
        }

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let hasPositionedNode = false;

        for (const node of nodes) {
            // Only consider nodes that have all coordinates defined
            if (node.x === undefined || node.y === undefined || node.z === undefined) {
                continue;
            }

            hasPositionedNode = true;
            minX = Math.min(minX, node.x);
            maxX = Math.max(maxX, node.x);
            minY = Math.min(minY, node.y);
            maxY = Math.max(maxY, node.y);
            minZ = Math.min(minZ, node.z);
            maxZ = Math.max(maxZ, node.z);
        }

        if (!hasPositionedNode) {
            return { minX: -100, maxX: 100, minY: -100, maxY: 100, minZ: -100, maxZ: 100 };
        }

        return { minX, maxX, minY, maxY, minZ, maxZ };
    }, [nodes]);

    // Convert 3D world coordinates to 2D minimap coordinates
    const worldToMinimap = useCallback((worldX: number, worldY: number, bounds: ReturnType<typeof calculateBounds>) => {
        const { minX, maxX, minY, maxY } = bounds;
        const padding = 10;
        const usableSize = size - padding * 2;

        // Normalize to 0-1
        const normalizedX = (worldX - minX) / (maxX - minX || 1);
        const normalizedY = (worldY - minY) / (maxY - minY || 1);

        // Map to minimap coordinates with padding
        return {
            x: padding + normalizedX * usableSize,
            y: padding + normalizedY * usableSize,
        };
    }, [size]);

    // Convert minimap coordinates to 3D world coordinates
    const minimapToWorld = useCallback((minimapX: number, minimapY: number, bounds: ReturnType<typeof calculateBounds>) => {
        const { minX, maxX, minY, maxY } = bounds;
        const padding = 10;
        const usableSize = size - padding * 2;

        // Convert from minimap coords to normalized 0-1
        const normalizedX = (minimapX - padding) / usableSize;
        const normalizedY = (minimapY - padding) / usableSize;

        // Map to world coordinates
        return {
            x: minX + normalizedX * (maxX - minX),
            y: minY + normalizedY * (maxY - minY),
        };
    }, [size]);

    // Render the minimap
    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, size, size);

        // Draw background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, size, size);

        const bounds = calculateBounds();

        // Draw community clusters
        if (communityResult && communityResult.communities.length > 0) {
            // Calculate community centroids
            const communityCentroids = new Map<number, { x: number; y: number; count: number }>();

            for (const node of nodes) {
                if (node.x === undefined || node.y === undefined) continue;

                const communityId = communityResult.nodeCommunities.get(node.id);
                if (communityId === undefined) continue;

                const centroid = communityCentroids.get(communityId) || { x: 0, y: 0, count: 0 };
                centroid.x += node.x;
                centroid.y += node.y;
                centroid.count += 1;
                communityCentroids.set(communityId, centroid);
            }

            // Draw community dots at their centroids
            for (const community of communityResult.communities) {
                const centroid = communityCentroids.get(community.id);
                if (!centroid || centroid.count === 0) continue;

                const avgX = centroid.x / centroid.count;
                const avgY = centroid.y / centroid.count;
                const { x, y } = worldToMinimap(avgX, avgY, bounds);

                ctx.fillStyle = community.color;
                ctx.beginPath();
                ctx.arc(x, y, COMMUNITY_DOT_SIZE, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            // If no communities, draw individual nodes as small dots
            const sampleRate = Math.max(1, Math.floor(nodes.length / 500)); // Sample to avoid too many dots
            
            for (let i = 0; i < nodes.length; i += sampleRate) {
                const node = nodes[i];
                if (node.x === undefined || node.y === undefined) continue;

                const { x, y } = worldToMinimap(node.x, node.y, bounds);

                ctx.fillStyle = 'rgba(100, 150, 255, 0.5)';
                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Draw viewport indicator
        if (cameraPosition) {
            const { x: camX, y: camY } = worldToMinimap(cameraPosition.x, cameraPosition.y, bounds);
            
            // Draw viewport as a semi-transparent rectangle/trapezoid
            // For simplicity, we'll draw a circle indicating camera position
            // and a small rectangle around it indicating the viewport frustum
            const viewportSize = 20; // Size of viewport indicator in minimap pixels

            ctx.strokeStyle = VIEWPORT_INDICATOR_STROKE;
            ctx.lineWidth = 2;
            ctx.strokeRect(
                camX - viewportSize / 2,
                camY - viewportSize / 2,
                viewportSize,
                viewportSize
            );

            ctx.fillStyle = VIEWPORT_INDICATOR_COLOR;
            ctx.fillRect(
                camX - viewportSize / 2,
                camY - viewportSize / 2,
                viewportSize,
                viewportSize
            );

            // Draw camera position dot
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.arc(camX, camY, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, size, size);
    }, [size, cameraPosition, communityResult, nodes, calculateBounds, worldToMinimap]);

    // Throttled render at 5Hz
    useEffect(() => {
        if (!isVisible) return;

        // Check if data has changed significantly
        const hasChanged = 
            lastRenderDataRef.current.cameraPos?.x !== cameraPosition?.x ||
            lastRenderDataRef.current.cameraPos?.y !== cameraPosition?.y ||
            lastRenderDataRef.current.cameraPos?.z !== cameraPosition?.z ||
            lastRenderDataRef.current.nodes !== nodes;

        if (!hasChanged) return;

        // Clear any pending timer
        if (updateTimerRef.current !== null) {
            clearTimeout(updateTimerRef.current);
            updateTimerRef.current = null;
        }

        // Render immediately on first change, then throttle
        if (updateTimerRef.current === null) {
            render();
            lastRenderDataRef.current = {
                cameraPos: cameraPosition ? { ...cameraPosition } : undefined,
                nodes,
            };
        }

        // Schedule next render
        updateTimerRef.current = window.setTimeout(() => {
            render();
            lastRenderDataRef.current = {
                cameraPos: cameraPosition ? { ...cameraPosition } : undefined,
                nodes,
            };
            updateTimerRef.current = null;
        }, UPDATE_INTERVAL_MS);

        return () => {
            if (updateTimerRef.current !== null) {
                clearTimeout(updateTimerRef.current);
                updateTimerRef.current = null;
            }
        };
    }, [isVisible, cameraPosition, nodes, render]);

    // Handle mouse events
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!onCameraMove) return;
        
        setIsDragging(true);
        
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const bounds = calculateBounds();
        const worldPos = minimapToWorld(x, y, bounds);

        // Preserve the current camera z position to maintain zoom level
        const currentZ = cameraPosition?.z ?? 300;

        onCameraMove({
            x: worldPos.x,
            y: worldPos.y,
            z: currentZ,
        });
    }, [onCameraMove, cameraPosition, calculateBounds, minimapToWorld]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDragging || !onCameraMove) return;

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const bounds = calculateBounds();
        const worldPos = minimapToWorld(x, y, bounds);

        // Preserve the current camera z position to maintain zoom level
        const currentZ = cameraPosition?.z ?? 300;

        onCameraMove({
            x: worldPos.x,
            y: worldPos.y,
            z: currentZ,
        });
    }, [isDragging, onCameraMove, cameraPosition, calculateBounds, minimapToWorld]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleMouseLeave = useCallback(() => {
        setIsDragging(false);
    }, []);

    if (!isVisible) {
        return null;
    }

    return (
        <div
            className={`fixed z-20
                ${isMobile 
                    ? 'bottom-20 right-2' /* Mobile: above bottom sheet */
                    : 'bottom-2 right-2' /* Desktop: bottom-right */
                }`}
            style={{
                width: size,
                height: size,
            }}
        >
            <canvas
                ref={canvasRef}
                width={size}
                height={size}
                className="cursor-pointer rounded shadow-lg"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                aria-label="Graph minimap - shows overview and current viewport"
            />
            <div className="absolute -top-6 right-0 text-xs text-white/70 bg-black/50 px-2 py-1 rounded">
                Press M to toggle
            </div>
        </div>
    );
}
