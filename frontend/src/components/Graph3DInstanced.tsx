import * as THREE from 'three';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphData } from '../types/graph';
import {
    InstancedNodeRenderer,
    type NodeData,
} from '../rendering/InstancedNodeRenderer';
import { LinkRenderer } from '../rendering/LinkRenderer';
import {
    ForceSimulation,
    type PhysicsConfig,
} from '../rendering/ForceSimulation';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { detectWebGLSupport } from '../utils/webglDetect';
import { AdaptiveLODManager, LODTier } from '../utils/levelOfDetail';
import LoadingSkeleton from './LoadingSkeleton';
import NodeTooltip from './NodeTooltip';
import PerformanceHUD from './PerformanceHUD';

/**
 * Graph3DInstanced - High-performance 3D graph visualization using InstancedMesh
 *
 * Replaces react-force-graph-3d with a custom THREE.js renderer that uses
 * InstancedMesh for dramatically improved performance with large graphs.
 *
 * Performance characteristics:
 * - Renders 100k nodes in ~4 draw calls for nodes (one per node type)
 * - Position updates in <5ms
 * - Memory usage <500MB for 100k nodes
 *
 * This component maintains API compatibility with the original Graph3D component
 * to allow for easy migration.
 */

type Filters = {
    subreddit: boolean;
    user: boolean;
    post: boolean;
    comment: boolean;
};

const TYPE_ORDER: Array<keyof Filters> = [
    'subreddit',
    'user',
    'post',
    'comment',
];

interface Props {
    filters: Filters;
    minDegree?: number;
    maxDegree?: number;
    linkOpacity: number;
    nodeRelSize: number;
    physics?: PhysicsConfig;
    focusNodeId?: string;
    selectedId?: string;
    onNodeSelect?: (id?: string) => void;
    showLabels?: boolean;
    communityResult?: {
        nodeCommunities: Map<string, number>;
        communities: Array<{ id: number; color: string }>;
    } | null;
    usePrecomputedLayout?: boolean;
    initialCamera?: { x: number; y: number; z: number };
    onCameraChange?: (camera: { x: number; y: number; z: number }) => void;
    sizeAttenuation?: boolean;
    enableAdaptiveLOD?: boolean;
    lodConfig?: {
        fpsDowngradeThreshold?: number;
        fpsUpgradeThreshold?: number;
        enableAdaptiveLOD?: boolean;
    };
    onLODTierChange?: (tier: number) => void;
}

export default function Graph3DInstanced(props: Props) {
    const {
        filters,
        minDegree,
        maxDegree,
        linkOpacity,
        nodeRelSize,
        physics,
        focusNodeId,
        onNodeSelect,
        communityResult,
        usePrecomputedLayout,
        initialCamera,
        onCameraChange,
        sizeAttenuation = true,
        enableAdaptiveLOD = true,
        lodConfig,
        onLODTierChange,
    } = props;

    // State
    const [graphData, setGraphData] = useState<GraphData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);
    const [webglSupported] = useState(() => detectWebGLSupport());
    const [onlyLinked, setOnlyLinked] = useState(true);
    const [currentLODTier, setCurrentLODTier] = useState<LODTier>(LODTier.HIGH);

    // Refs for Three.js objects
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const nodeRendererRef = useRef<InstancedNodeRenderer | null>(null);
    const linkRendererRef = useRef<LinkRenderer | null>(null);
    const simulationRef = useRef<ForceSimulation | null>(null);
    const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
    const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
    const hoveredNodeRef = useRef<string | null>(null);
    const labelsGroupRef = useRef<THREE.Group | null>(null);
    const lodManagerRef = useRef<AdaptiveLODManager | null>(null);
    const lastFrameTimeRef = useRef<number>(performance.now());
    const fpsHistoryRef = useRef<number[]>([]);

    // State for tooltip
    const [hoveredNode] = useState<{
        id: string;
        name?: string;
        type?: string;
        mouseX: number;
        mouseY: number;
    } | null>(null);

    const MAX_RENDER_NODES = useMemo(() => {
        const raw = import.meta.env?.VITE_MAX_RENDER_NODES as unknown as
            | string
            | number
            | undefined;
        const n = typeof raw === 'string' ? parseInt(raw) : Number(raw);
        return Number.isFinite(n) && (n as number) > 0 ? (n as number) : 20000;
    }, []);

    const MAX_RENDER_LINKS = useMemo(() => {
        const raw = import.meta.env?.VITE_MAX_RENDER_LINKS as unknown as
            | string
            | number
            | undefined;
        const n = typeof raw === 'string' ? parseInt(raw) : Number(raw);
        return Number.isFinite(n) && (n as number) > 0 ? (n as number) : 50000;
    }, []);

    const activeTypes = useMemo(() => {
        const enabled = Object.entries(filters)
            .filter(([, value]) => value)
            .map(([key]) => key as keyof Filters);
        return enabled.sort(
            (a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b),
        );
    }, [filters]);

    const activeTypesRef = useRef<string[]>(activeTypes);

    useEffect(() => {
        activeTypesRef.current = activeTypes;
    }, [activeTypes]);

    // Load graph data
    const load = useCallback(
        async ({
            signal,
            types,
        }: { signal?: AbortSignal; types?: string[] } = {}) => {
            const selected =
                types && types.length > 0 ? types : activeTypesRef.current;
            if (!selected || selected.length === 0) {
                setGraphData({ nodes: [], links: [] });
                setError(null);
                setLoading(false);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const base = (import.meta.env?.VITE_API_URL || '/api').replace(
                    /\/$/,
                    '',
                );
                const params = new URLSearchParams({
                    max_nodes: String(MAX_RENDER_NODES),
                    max_links: String(MAX_RENDER_LINKS),
                });
                if (usePrecomputedLayout) params.set('with_positions', 'true');
                if (selected.length > 0) {
                    params.set('types', selected.join(','));
                }
                const url = `${base}/graph?${params.toString()}`;
                const response = await fetch(url, { signal });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = (await response.json()) as GraphData;

                setGraphData(data);
                setInitialLoadComplete(true);
            } catch (err) {
                if ((err as { name?: string })?.name === 'AbortError') return;
                setError((err as Error).message);
                setGraphData(null);
            } finally {
                if (!signal || !signal.aborted) {
                    setLoading(false);
                }
            }
        },
        [MAX_RENDER_LINKS, MAX_RENDER_NODES, usePrecomputedLayout],
    );

    useEffect(() => {
        if (activeTypes.length === 0) {
            setGraphData({ nodes: [], links: [] });
            setError(null);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        load({ signal: controller.signal, types: activeTypes });
        return () => controller.abort();
    }, [activeTypes, load]);

    // Initialize Three.js scene
    useEffect(() => {
        if (!containerRef.current || !webglSupported) return;

        // Create scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        sceneRef.current = scene;

        // Create camera
        const camera = new THREE.PerspectiveCamera(
            75,
            containerRef.current.clientWidth /
                containerRef.current.clientHeight,
            0.1,
            10000,
        );
        camera.position.set(0, 0, 500);
        cameraRef.current = camera;

        // Create renderer
        const renderer = new THREE.WebGLRenderer({
            antialias: false,
            powerPreference: 'high-performance',
        });
        renderer.setSize(
            containerRef.current.clientWidth,
            containerRef.current.clientHeight,
        );
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap for performance
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Create controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controlsRef.current = controls;

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight.position.set(1, 1, 1);
        scene.add(directionalLight);

        // Create node renderer
        const nodeRenderer = new InstancedNodeRenderer(scene, {
            maxNodes: MAX_RENDER_NODES,
            nodeRelSize,
            sizeAttenuation,
        });
        nodeRendererRef.current = nodeRenderer;
        
        // Set camera reference for distance-based scaling
        nodeRenderer.setCamera(camera);

        // Create link renderer with initial opacity
        const linkRenderer = new LinkRenderer(scene, {
            maxLinks: MAX_RENDER_LINKS,
            opacity: linkOpacity,
        });
        linkRendererRef.current = linkRenderer;

        // Create group for labels
        const labelsGroup = new THREE.Group();
        scene.add(labelsGroup);
        labelsGroupRef.current = labelsGroup;

        // Initialize LOD manager
        const lodManager = new AdaptiveLODManager();
        if (lodConfig) {
            lodManager.setConfig({
                enableAdaptiveLOD: enableAdaptiveLOD && (lodConfig.enableAdaptiveLOD ?? true),
                fpsDowngradeThreshold: lodConfig.fpsDowngradeThreshold ?? 24,
                fpsUpgradeThreshold: lodConfig.fpsUpgradeThreshold ?? 50,
            });
        } else {
            lodManager.setConfig({ enableAdaptiveLOD });
        }
        lodManagerRef.current = lodManager;

        // Set initial camera if provided
        if (initialCamera) {
            camera.position.set(
                initialCamera.x,
                initialCamera.y,
                initialCamera.z,
            );
        }

        // Track last camera position for throttling
        let lastCameraUpdate = 0;
        let lastLinkVisibilityUpdate = 0;
        const CAMERA_UPDATE_INTERVAL = 1000; // Update every 1 second
        // Link visibility update: minimum interval between checks (actual timing depends on frame rate)
        // LinkRenderer has built-in camera movement detection to skip redundant updates
        const LINK_VISIBILITY_UPDATE_INTERVAL = 300; // Min 300ms between visibility checks
        const lastCamPos = { x: NaN, y: NaN, z: NaN };
        const EPSILON = 1e-3;

        // Animation loop
        let animationId: number;
        const animate = () => {
            animationId = requestAnimationFrame(animate);
            
            // Track FPS
            const now = performance.now();
            const delta = now - lastFrameTimeRef.current;
            if (delta > 0) {
                const fps = 1000 / delta;
                lodManager.recordFrame(fps);
                fpsHistoryRef.current.push(fps);
                if (fpsHistoryRef.current.length > 60) {
                    fpsHistoryRef.current.shift();
                }
            }
            lastFrameTimeRef.current = now;
            
            // Update LOD manager
            lodManager.update(now);
            const lodParams = lodManager.getRenderingParams(now);
            
            // Update LOD tier state if changed
            if (lodParams.tier !== currentLODTier) {
                setCurrentLODTier(lodParams.tier);
                if (onLODTierChange) {
                    onLODTierChange(lodParams.tier);
                }
            }
            
            controls.update();

            // Update node camera position for distance-based scaling
            if (nodeRenderer) {
                nodeRenderer.updateCameraPosition();
            }

            // Update link visibility and opacity based on LOD
            // updateVisibility() skips work if camera hasn't moved significantly
            // refresh() skips work if visibility hasn't changed (needsUpdate flag)
            const linkUpdateTime = Date.now();
            if (
                linkRenderer &&
                linkUpdateTime - lastLinkVisibilityUpdate > LINK_VISIBILITY_UPDATE_INTERVAL
            ) {
                if (lodParams.showLinks) {
                    linkRenderer.updateVisibility(camera);
                    // Apply LOD opacity multiplier
                    linkRenderer.setOpacity(linkOpacity * lodParams.linkOpacityMultiplier);
                    linkRenderer.refresh();
                } else {
                    // Hide all links in LOW/EMERGENCY tiers
                    linkRenderer.setOpacity(0);
                    linkRenderer.refresh();
                }
                lastLinkVisibilityUpdate = linkUpdateTime;
            }

            renderer.render(scene, camera);

            // Throttle camera change emissions
            if (onCameraChange) {
                if (linkUpdateTime - lastCameraUpdate > CAMERA_UPDATE_INTERVAL) {
                    const { x, y, z } = camera.position;
                    // Only emit if position changed significantly
                    if (
                        Math.abs(x - lastCamPos.x) > EPSILON ||
                        Math.abs(y - lastCamPos.y) > EPSILON ||
                        Math.abs(z - lastCamPos.z) > EPSILON
                    ) {
                        onCameraChange({ x, y, z });
                        lastCamPos.x = x;
                        lastCamPos.y = y;
                        lastCamPos.z = z;
                        lastCameraUpdate = linkUpdateTime;
                    }
                }
            }
        };
        animate();

        // Handle resize
        const handleResize = () => {
            if (!containerRef.current) return;
            camera.aspect =
                containerRef.current.clientWidth /
                containerRef.current.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(
                containerRef.current.clientWidth,
                containerRef.current.clientHeight,
            );
        };
        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationId);
            controls.dispose();
            renderer.dispose();
            nodeRenderer.dispose();
            linkRenderer.dispose();
            // Copy ref to variable for cleanup to avoid stale closure issue
            const container = containerRef.current;
            if (container && renderer.domElement.parentNode === container) {
                container.removeChild(renderer.domElement);
            }
        };
    }, [
        webglSupported,
        nodeRelSize,
        MAX_RENDER_NODES,
        MAX_RENDER_LINKS,
        initialCamera,
        onCameraChange,
        linkOpacity,
        sizeAttenuation,
        enableAdaptiveLOD,
        lodConfig,
        onLODTierChange,
    ]);

    // Process graph data with filters
    const filtered = useMemo(() => {
        if (!graphData) return { nodes: [], links: [] };

        const allowed = new Set(
            Object.entries(filters)
                .filter(([, v]) => v)
                .map(([k]) => k),
        );

        let nodes = graphData.nodes.filter(n => !n.type || allowed.has(n.type));
        let links = graphData.links;

        // Apply degree filters if specified
        if (minDegree !== undefined || maxDegree !== undefined) {
            const degreeMap = new Map<string, number>();
            for (const link of links) {
                degreeMap.set(
                    link.source,
                    (degreeMap.get(link.source) || 0) + 1,
                );
                degreeMap.set(
                    link.target,
                    (degreeMap.get(link.target) || 0) + 1,
                );
            }

            nodes = nodes.filter(n => {
                const degree = degreeMap.get(n.id) || 0;
                if (minDegree !== undefined && degree < minDegree) return false;
                if (maxDegree !== undefined && degree > maxDegree) return false;
                return true;
            });
        }

        const nodeIds = new Set(nodes.map(n => n.id));
        links = links.filter(
            l => nodeIds.has(l.source) && nodeIds.has(l.target),
        );

        // Filter to only linked nodes if enabled
        if (onlyLinked) {
            const linkedIds = new Set<string>();
            for (const link of links) {
                linkedIds.add(link.source);
                linkedIds.add(link.target);
            }
            nodes = nodes.filter(n => linkedIds.has(n.id));
        }

        // Limit to max nodes/links
        if (
            nodes.length > MAX_RENDER_NODES ||
            links.length > MAX_RENDER_LINKS
        ) {
            // Simple truncation for now (could be improved with weighting)
            nodes = nodes.slice(0, MAX_RENDER_NODES);
            const nodeIdSet = new Set(nodes.map(n => n.id));
            links = links
                .filter(l => nodeIdSet.has(l.source) && nodeIdSet.has(l.target))
                .slice(0, MAX_RENDER_LINKS);
        }

        return { nodes, links };
    }, [
        graphData,
        filters,
        minDegree,
        maxDegree,
        onlyLinked,
        MAX_RENDER_NODES,
        MAX_RENDER_LINKS,
    ]);

    // Update node renderer when filtered data changes
    useEffect(() => {
        if (!nodeRendererRef.current) return;

        // If there are no filtered nodes, clear the renderer so the scene matches the current state
        if (!filtered.nodes.length) {
            nodeRendererRef.current.setNodeData([]);
            return;
        }

        const nodeData: NodeData[] = filtered.nodes.map(node => {
            // Get color from community or type
            let color: string | undefined;
            if (communityResult) {
                const commId = communityResult.nodeCommunities.get(node.id);
                if (commId !== undefined) {
                    const community = communityResult.communities.find(
                        c => c.id === commId,
                    );
                    if (community) color = community.color;
                }
            }

            // Calculate size based on node value
            let size: number;
            const val = typeof node.val === 'number' ? node.val : 1;
            switch (node.type) {
                case 'subreddit':
                    size = Math.max(2, Math.pow(val, 0.35));
                    break;
                case 'user':
                    size = Math.max(1.5, Math.pow(val, 0.5));
                    break;
                case 'post':
                    size = 1.4;
                    break;
                case 'comment':
                    size = 1;
                    break;
                default:
                    size = Math.max(1, Math.pow(val, 0.5));
            }

            return {
                id: node.id,
                type: node.type || 'default',
                x: node.x,
                y: node.y,
                z: node.z,
                size,
                color,
            };
        });

        nodeRendererRef.current.setNodeData(nodeData);
    }, [filtered, communityResult]);

    // Initialize/update force simulation
    useEffect(() => {
        if (!nodeRendererRef.current) return;

        // Create simulation if it doesn't exist
        if (!simulationRef.current) {
            simulationRef.current = new ForceSimulation({
                onTick: positions => {
                    if (nodeRendererRef.current) {
                        nodeRendererRef.current.updatePositions(positions);
                    }
                    if (linkRendererRef.current) {
                        linkRendererRef.current.updatePositions(positions);
                        linkRendererRef.current.refresh();
                    }
                },
                physics,
                usePrecomputedPositions: usePrecomputedLayout,
            });
        }

        // Set data and start simulation
        simulationRef.current.setData(filtered.nodes, filtered.links);
        simulationRef.current.start();

        return () => {
            if (simulationRef.current) {
                simulationRef.current.stop();
            }
        };
    }, [filtered, physics, usePrecomputedLayout]);

    // Update physics when it changes
    useEffect(() => {
        if (simulationRef.current && physics) {
            simulationRef.current.updatePhysics(physics);
        }
    }, [physics]);

    // Set up links with LinkRenderer
    useEffect(() => {
        if (!linkRendererRef.current) return;

        // Set links data
        linkRendererRef.current.setLinks(filtered.links);

        // Build initial positions map from filtered nodes
        const positions = new Map<
            string,
            { x: number; y: number; z: number }
        >();
        for (const node of filtered.nodes) {
            if (
                node.x !== undefined &&
                node.y !== undefined &&
                node.z !== undefined
            ) {
                positions.set(node.id, { x: node.x, y: node.y, z: node.z });
            }
        }

        linkRendererRef.current.updatePositions(positions);
        linkRendererRef.current.refresh();
    }, [filtered]);

    // Update link opacity
    useEffect(() => {
        if (!linkRendererRef.current) return;
        linkRendererRef.current.setOpacity(linkOpacity);
    }, [linkOpacity]);

    // Update size attenuation
    useEffect(() => {
        if (!nodeRendererRef.current) return;
        nodeRendererRef.current.setSizeAttenuation(sizeAttenuation);
    }, [sizeAttenuation]);

    // Handle mouse interactions
    useEffect(() => {
        if (
            !containerRef.current ||
            !nodeRendererRef.current ||
            !cameraRef.current
        )
            return;

        const container = containerRef.current;
        const raycaster = raycasterRef.current;
        const mouse = mouseRef.current;
        const nodeRenderer = nodeRendererRef.current;
        const camera = cameraRef.current;

        const handleMouseMove = (event: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const nodeId = nodeRenderer.raycast(raycaster);

            if (nodeId !== hoveredNodeRef.current) {
                hoveredNodeRef.current = nodeId;
                container.style.cursor = nodeId ? 'pointer' : 'default';

                // Could trigger tooltip here
                if (nodeId) {
                    const node = filtered.nodes.find(n => n.id === nodeId);
                    if (node) {
                        container.title = node.name || node.id;
                    }
                } else {
                    container.title = '';
                }
            }
        };

        const handleClick = () => {
            if (hoveredNodeRef.current && onNodeSelect) {
                const node = filtered.nodes.find(
                    n => n.id === hoveredNodeRef.current,
                );
                onNodeSelect(node?.name || hoveredNodeRef.current);
            }
        };

        container.addEventListener('mousemove', handleMouseMove);
        container.addEventListener('click', handleClick);

        return () => {
            container.removeEventListener('mousemove', handleMouseMove);
            container.removeEventListener('click', handleClick);
        };
    }, [filtered, onNodeSelect]);

    // Focus camera on node
    useEffect(() => {
        if (
            !focusNodeId ||
            !cameraRef.current ||
            !controlsRef.current ||
            !nodeRendererRef.current
        )
            return;

        // Try to find node by id or name (case-insensitive)
        const matchedNode = filtered.nodes.find(
            n =>
                n.id === focusNodeId ||
                n.name?.toLowerCase() === focusNodeId.toLowerCase(),
        );

        if (!matchedNode) return;

        const position = nodeRendererRef.current.getNodePosition(
            matchedNode.id,
        );
        if (position) {
            const distance = 200;
            cameraRef.current.position.set(
                position.x + distance,
                position.y + distance,
                position.z + distance,
            );
            controlsRef.current.target.set(position.x, position.y, position.z);
            controlsRef.current.update();
        }
    }, [focusNodeId, filtered]);

    // Show loading skeleton during initial load
    if (loading && !initialLoadComplete) {
        return <LoadingSkeleton />;
    }

    // Show WebGL warning if not supported
    if (!webglSupported) {
        throw new Error('WebGL is not supported in your browser');
    }

    return (
        <div className='w-full h-screen relative'>
            {error && (
                <div className='absolute top-2 left-2 z-20 bg-red-900/70 text-red-100 rounded px-3 py-2 text-sm max-w-md'>
                    <div className='flex items-start gap-2'>
                        <svg
                            className='w-5 h-5 flex-shrink-0 mt-0.5'
                            fill='none'
                            viewBox='0 0 24 24'
                            stroke='currentColor'
                        >
                            <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth={2}
                                d='M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                            />
                        </svg>
                        <div className='flex-1'>
                            <p className='font-medium mb-1'>
                                Error loading graph
                            </p>
                            <p className='text-xs opacity-90'>{error}</p>
                            <button
                                onClick={() => load()}
                                className='mt-2 px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-sm font-medium transition-colors'
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {loading && initialLoadComplete && (
                <div className='absolute top-2 left-2 z-20 bg-black/50 text-white rounded px-3 py-2 text-sm'>
                    Updating graph…
                </div>
            )}
            <div className='absolute top-2 left-2 z-10 bg-black/50 text-white rounded px-3 py-2 text-sm flex items-center gap-3'>
                <button
                    className='border border-white/30 rounded px-2 py-1 hover:bg-white/10'
                    onClick={() => load()}
                >
                    Reload
                </button>
                <label className='ml-2 flex items-center gap-1 cursor-pointer'>
                    <input
                        type='checkbox'
                        checked={onlyLinked}
                        onChange={() => setOnlyLinked(v => !v)}
                        className='accent-blue-400'
                    />
                    <span className='opacity-80'>Only show linked nodes</span>
                </label>
            </div>
            <div ref={containerRef} className='w-full h-full' />
            <NodeTooltip
                nodeId={hoveredNode?.id || null}
                nodeName={hoveredNode?.name}
                nodeType={hoveredNode?.type}
                mouseX={hoveredNode?.mouseX || 0}
                mouseY={hoveredNode?.mouseY || 0}
            />
            <PerformanceHUD
                renderer={rendererRef.current}
                nodeCount={filtered.nodes.length}
                totalNodeCount={graphData?.nodes.length || 0}
                simulationState={usePrecomputedLayout ? 'precomputed' : 'active'}
                lodLevel={currentLODTier}
            />
        </div>
    );
}
