import * as THREE from 'three';

/**
 * LinkRenderer - High-performance link rendering using THREE.LineSegments
 *
 * Renders all visible links in a single draw call using GPU-accelerated LineSegments.
 * This dramatically reduces draw calls and improves performance for large graphs.
 *
 * Key features:
 * - Single LineSegments draw call for all links
 * - Viewport-based link filtering (frustum culling)
 * - Pre-allocated Float32Array buffer for efficient updates
 * - Dynamic buffer resizing as needed
 * - Opacity control via material uniform
 *
 * Performance targets:
 * - 1 draw call for all links
 * - <10ms buffer update for 200k links
 * - Links hidden when endpoints are off-screen
 *
 * @example
 * ```typescript
 * const linkRenderer = new LinkRenderer(scene, {
 *   maxLinks: 200000,
 *   opacity: 0.3
 * });
 *
 * // Set link data
 * linkRenderer.setLinks(links);
 *
 * // Update when node positions change
 * linkRenderer.updatePositions(nodePositions);
 *
 * // Update when camera moves (for frustum culling)
 * linkRenderer.updateVisibility(camera);
 *
 * // Update opacity
 * linkRenderer.setOpacity(0.5);
 * ```
 */

export interface LinkData {
    source: string;
    target: string;
}

export interface LinkRendererConfig {
    maxLinks?: number;
    opacity?: number;
    color?: number;
}

export class LinkRenderer {
    private scene: THREE.Scene;
    private geometry: THREE.BufferGeometry;
    private material: THREE.LineBasicMaterial;
    private lineSegments: THREE.LineSegments | null = null;
    private links: LinkData[] = [];
    private nodePositions: Map<string, { x: number; y: number; z: number }> =
        new Map();
    private visibleNodeIds: Set<string> = new Set();
    private positionsBuffer: Float32Array;
    private maxLinks: number;
    private needsUpdate = false;
    private lastCameraUpdate: {
        position: THREE.Vector3;
        target: THREE.Vector3;
    } | null = null;
    private positionsDirty = false; // Track if positions changed since last visibility update
    private lastPerformanceWarning = 0; // Timestamp of last performance warning
    private readonly frustum = new THREE.Frustum();
    private readonly cameraMatrix = new THREE.Matrix4();
    private static readonly MIN_CAMERA_POSITION_DELTA = 10;
    private static readonly MIN_CAMERA_TARGET_DELTA = 10;
    private static readonly PERFORMANCE_WARNING_THROTTLE = 5000; // Warn at most once per 5 seconds

    constructor(scene: THREE.Scene, config: LinkRendererConfig = {}) {
        this.scene = scene;
        this.maxLinks = config.maxLinks || 200000;

        // Pre-allocate buffer for link positions (2 vertices per link × 3 components per vertex)
        this.positionsBuffer = new Float32Array(this.maxLinks * 2 * 3);

        // Create geometry with position attribute
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.positionsBuffer, 3).setUsage(
                THREE.DynamicDrawUsage,
            ),
        );
        this.geometry.setDrawRange(0, 0); // Start with no links visible

        // Create material
        this.material = new THREE.LineBasicMaterial({
            color: config.color !== undefined ? config.color : 0x999999,
            opacity: config.opacity !== undefined ? config.opacity : 0.3,
            transparent: true,
            depthTest: true,
            depthWrite: false,
        });

        // Create LineSegments
        this.lineSegments = new THREE.LineSegments(
            this.geometry,
            this.material,
        );
        this.scene.add(this.lineSegments);
    }

    /**
     * Set the links to be rendered
     */
    public setLinks(links: LinkData[]): void {
        const maxRenderableLinks = this.maxLinks;

        // Clamp to maxLinks to avoid storing more links than the buffer can represent
        let clampedLinks = links;
        if (links.length > maxRenderableLinks) {
            console.warn(
                `LinkRenderer: received ${links.length} links but maxLinks is ${maxRenderableLinks}. ` +
                    `Only the first ${maxRenderableLinks} links will be rendered.`,
            );
            clampedLinks = links.slice(0, maxRenderableLinks);
        }

        this.links = clampedLinks;

        // Resize buffer if necessary
        const requiredSize = clampedLinks.length * 2 * 3;
        const maxBufferSize = this.maxLinks * 2 * 3;

        if (
            requiredSize > this.positionsBuffer.length &&
            this.positionsBuffer.length < maxBufferSize
        ) {
            const candidateSize = Math.max(
                requiredSize,
                this.positionsBuffer.length * 2,
            );
            const newSize = Math.min(candidateSize, maxBufferSize);

            // Avoid reallocating if we cannot actually increase capacity
            if (newSize > this.positionsBuffer.length) {
                this.positionsBuffer = new Float32Array(newSize);
                this.geometry.setAttribute(
                    'position',
                    new THREE.BufferAttribute(this.positionsBuffer, 3).setUsage(
                        THREE.DynamicDrawUsage,
                    ),
                );
            }
        }

        this.needsUpdate = true;
    }

    /**
     * Update node positions and refresh link endpoints
     */
    public updatePositions(
        positions: Map<string, { x: number; y: number; z: number }>,
    ): void {
        this.nodePositions = positions;
        this.positionsDirty = true; // Mark that positions have changed
        this.needsUpdate = true;
    }

    /**
     * Update visible node IDs based on camera frustum
     * Call this when the camera moves significantly
     */
    public updateVisibility(camera: THREE.Camera): void {
        // Check if camera moved significantly
        const cameraPos = camera.position.clone();
        const cameraTarget = new THREE.Vector3();

        if (camera instanceof THREE.PerspectiveCamera) {
            camera.getWorldDirection(cameraTarget);
            cameraTarget.multiplyScalar(100).add(cameraPos);
        }

        // Force update if positions changed since last visibility update,
        // even if camera hasn't moved (nodes may have moved in/out of frustum)
        const forceUpdate = this.positionsDirty;

        // Only update if camera moved significantly (optimization)
        if (!forceUpdate && this.lastCameraUpdate) {
            const posDiff = cameraPos.distanceTo(
                this.lastCameraUpdate.position,
            );
            const targetDiff = cameraTarget.distanceTo(
                this.lastCameraUpdate.target,
            );
            if (
                posDiff < LinkRenderer.MIN_CAMERA_POSITION_DELTA &&
                targetDiff < LinkRenderer.MIN_CAMERA_TARGET_DELTA
            ) {
                return; // Camera hasn't moved significantly and positions haven't changed
            }
        }

        this.lastCameraUpdate = { position: cameraPos, target: cameraTarget };
        this.positionsDirty = false; // Clear the flag after updating visibility

        // Update frustum
        camera.updateMatrixWorld();
        this.cameraMatrix.multiplyMatrices(
            camera.projectionMatrix,
            camera.matrixWorldInverse,
        );
        this.frustum.setFromProjectionMatrix(this.cameraMatrix);

        // Update visible nodes
        this.visibleNodeIds.clear();
        const tempVector = new THREE.Vector3();
        for (const [nodeId, pos] of this.nodePositions.entries()) {
            tempVector.set(pos.x, pos.y, pos.z);
            if (this.frustum.containsPoint(tempVector)) {
                this.visibleNodeIds.add(nodeId);
            }
        }

        this.needsUpdate = true;
    }

    /**
     * Refresh the link geometry buffer
     * Call this after updating positions or visibility
     */
    public refresh(): void {
        if (!this.needsUpdate) {
            return;
        }

        const startTime = performance.now();

        let vertexCount = 0;

        // Only render links where both endpoints are visible
        for (const link of this.links) {
            const sourcePos = this.nodePositions.get(link.source);
            const targetPos = this.nodePositions.get(link.target);

            // Skip if either node doesn't have a position
            if (!sourcePos || !targetPos) {
                continue;
            }

            // Skip if either endpoint is not visible (frustum culling)
            // If visibleNodeIds is empty, render all links (no culling active)
            if (
                this.visibleNodeIds.size > 0 &&
                (!this.visibleNodeIds.has(link.source) ||
                    !this.visibleNodeIds.has(link.target))
            ) {
                continue;
            }

            // Check if we've exceeded buffer capacity
            if (vertexCount * 3 >= this.positionsBuffer.length) {
                // Buffer capacity exceeded - this should not happen since setLinks() clamps to maxLinks
                break;
            }

            const baseIndex = vertexCount * 3;

            // Source vertex
            this.positionsBuffer[baseIndex] = sourcePos.x;
            this.positionsBuffer[baseIndex + 1] = sourcePos.y;
            this.positionsBuffer[baseIndex + 2] = sourcePos.z;

            // Target vertex
            this.positionsBuffer[baseIndex + 3] = targetPos.x;
            this.positionsBuffer[baseIndex + 4] = targetPos.y;
            this.positionsBuffer[baseIndex + 5] = targetPos.z;

            vertexCount += 2;
        }

        // Update draw range to only render the populated vertices
        this.geometry.setDrawRange(0, vertexCount);
        this.geometry.attributes.position.needsUpdate = true;

        this.needsUpdate = false;

        const elapsed = performance.now() - startTime;
        if (elapsed > 10) {
            // Throttle warnings to avoid console spam (max once per 5 seconds)
            const now = Date.now();
            if (
                now - this.lastPerformanceWarning >
                LinkRenderer.PERFORMANCE_WARNING_THROTTLE
            ) {
                console.warn(
                    `LinkRenderer: Buffer update took ${elapsed.toFixed(2)}ms for ${vertexCount / 2} links (target <10ms)`,
                );
                this.lastPerformanceWarning = now;
            }
        }
    }

    /**
     * Set the opacity of all links
     */
    public setOpacity(opacity: number): void {
        this.material.opacity = Math.max(0, Math.min(1, opacity));
    }

    /**
     * Set the color of all links
     */
    public setColor(color: number): void {
        this.material.color.setHex(color);
    }

    /**
     * Get rendering statistics
     * Note: visibleLinks calculation may be expensive for very large graphs (200k+ links)
     * as it filters the entire links array. This is acceptable for debugging/monitoring
     * but should not be called in performance-critical paths.
     */
    public getStats(): {
        totalLinks: number;
        visibleLinks: number;
        bufferedLinks: number;
        drawCalls: number;
    } {
        const drawRange = this.geometry.drawRange;
        return {
            totalLinks: this.links.length,
            // visibleLinks is calculated on-demand for accuracy
            // For performance-critical usage, use bufferedLinks instead
            visibleLinks:
                this.visibleNodeIds.size > 0 ?
                    this.links.filter(
                        l =>
                            this.visibleNodeIds.has(l.source) &&
                            this.visibleNodeIds.has(l.target),
                    ).length
                :   this.links.length,
            bufferedLinks: drawRange.count / 2,
            drawCalls: drawRange.count > 0 ? 1 : 0,
        };
    }

    /**
     * Dispose of all resources
     */
    public dispose(): void {
        if (this.lineSegments) {
            this.scene.remove(this.lineSegments);
        }
        this.geometry.dispose();
        this.material.dispose();
        this.links = [];
        this.nodePositions.clear();
        this.visibleNodeIds.clear();
    }
}
