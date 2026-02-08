import * as THREE from 'three';

/**
 * LinkRenderer - High-performance link rendering using THREE.LineSegments
 * 
 * Renders all links in a single draw call using GPU batching.
 * This dramatically reduces draw calls from O(n) to O(1) for links.
 * 
 * Key features:
 * - Single LineSegments object for all links (1 draw call)
 * - Pre-allocated Float32Array buffer for positions
 * - Viewport-based frustum culling (only render visible links)
 * - Dynamic buffer updates when node positions change
 * - Opacity control via material uniform
 * 
 * Performance targets:
 * - 1 draw call for 200k links
 * - <10ms buffer update time for 200k links
 * - Automatic frustum culling for off-screen links
 * 
 * @example
 * ```typescript
 * const renderer = new LinkRenderer(scene, {
 *   maxLinks: 200000,
 *   opacity: 0.6
 * });
 * 
 * // Set initial link data
 * renderer.setLinks(links);
 * 
 * // Update positions when nodes move
 * renderer.updatePositions(nodePositions);
 * 
 * // Update when camera moves (for frustum culling)
 * renderer.updateFrustumCulling(camera);
 * 
 * // Change opacity
 * renderer.setOpacity(0.3);
 * ```
 */

export interface LinkData {
  source: string;
  target: string;
}

export interface LinkRendererConfig {
  maxLinks?: number;
  opacity?: number;
  color?: number | string;
  enableFrustumCulling?: boolean;
}

export class LinkRenderer {
  private scene: THREE.Scene;
  private lineSegments: THREE.LineSegments | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.LineBasicMaterial | null = null;
  private positionsBuffer: Float32Array;
  private maxLinks: number;
  private links: LinkData[] = [];
  private nodePositions: Map<string, { x: number; y: number; z: number }> = new Map();
  private enableFrustumCulling: boolean;
  private visibleLinkIndices: Set<number> = new Set();
  private needsUpdate = false;

  constructor(scene: THREE.Scene, config: LinkRendererConfig = {}) {
    this.scene = scene;
    this.maxLinks = config.maxLinks || 200000;
    this.enableFrustumCulling = config.enableFrustumCulling ?? true;

    // Pre-allocate buffer: 2 vertices per link × 3 components (x, y, z)
    this.positionsBuffer = new Float32Array(this.maxLinks * 2 * 3);

    // Create material
    this.material = new THREE.LineBasicMaterial({
      color: config.color ?? 0x999999,
      opacity: config.opacity ?? 0.6,
      transparent: true,
    });

    // Create geometry with pre-allocated buffer
    this.geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(this.positionsBuffer, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage); // Will be updated frequently
    this.geometry.setAttribute('position', positionAttribute);

    // Create line segments
    this.lineSegments = new THREE.LineSegments(this.geometry, this.material);
    this.lineSegments.frustumCulled = false; // We handle culling manually
    this.scene.add(this.lineSegments);
  }

  /**
   * Set link data
   * @param links Array of link objects with source and target IDs
   */
  public setLinks(links: LinkData[]): void {
    const linkCount = Math.min(links.length, this.maxLinks);
    this.links = links.slice(0, linkCount);
    
    // Mark all links as potentially visible initially
    this.visibleLinkIndices.clear();
    for (let i = 0; i < this.links.length; i++) {
      this.visibleLinkIndices.add(i);
    }
    
    this.needsUpdate = true;
    this.updateBuffer();
  }

  /**
   * Update node positions
   * @param positions Map of node ID to position
   */
  public updatePositions(positions: Map<string, { x: number; y: number; z: number }>): void {
    this.nodePositions = positions;
    this.needsUpdate = true;
    this.updateBuffer();
  }

  /**
   * Update frustum culling based on camera
   * @param camera The camera to use for frustum culling
   */
  public updateFrustumCulling(camera: THREE.Camera): void {
    if (!this.enableFrustumCulling) return;

    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(projScreenMatrix);

    // Update visible link indices based on frustum
    const prevVisibleIndices = new Set(this.visibleLinkIndices);
    this.visibleLinkIndices.clear();

    const sourcePos = new THREE.Vector3();
    const targetPos = new THREE.Vector3();

    for (let i = 0; i < this.links.length; i++) {
      const link = this.links[i];
      const source = this.nodePositions.get(link.source);
      const target = this.nodePositions.get(link.target);

      if (!source || !target) continue;

      sourcePos.set(source.x, source.y, source.z);
      targetPos.set(target.x, target.y, target.z);

      // Only render link if at least one endpoint is visible
      if (frustum.containsPoint(sourcePos) || frustum.containsPoint(targetPos)) {
        this.visibleLinkIndices.add(i);
      }
    }

    // Check if the visible set actually changed
    let setChanged = prevVisibleIndices.size !== this.visibleLinkIndices.size;
    if (!setChanged) {
      // Same size, but check if contents are the same
      for (const idx of this.visibleLinkIndices) {
        if (!prevVisibleIndices.has(idx)) {
          setChanged = true;
          break;
        }
      }
    }

    // Only update buffer if visibility actually changed
    if (setChanged) {
      this.needsUpdate = true;
      this.updateBuffer();
    }
  }

  /**
   * Update the positions buffer with current link data
   */
  private updateBuffer(): void {
    if (!this.needsUpdate || !this.geometry) return;

    const startTime = performance.now();
    let vertexIndex = 0;

    // Populate buffer only with visible links
    for (const linkIndex of this.visibleLinkIndices) {
      const link = this.links[linkIndex];
      if (!link) continue;

      const source = this.nodePositions.get(link.source);
      const target = this.nodePositions.get(link.target);

      if (!source || !target) continue;

      const baseIndex = vertexIndex * 3;

      // Source vertex
      this.positionsBuffer[baseIndex] = source.x;
      this.positionsBuffer[baseIndex + 1] = source.y;
      this.positionsBuffer[baseIndex + 2] = source.z;

      // Target vertex
      this.positionsBuffer[baseIndex + 3] = target.x;
      this.positionsBuffer[baseIndex + 4] = target.y;
      this.positionsBuffer[baseIndex + 5] = target.z;

      vertexIndex += 2;
    }

    // Update draw range to only render visible links
    this.geometry.setDrawRange(0, vertexIndex);

    // Mark buffer as needing update
    const positionAttribute = this.geometry.getAttribute('position');
    if (positionAttribute) {
      positionAttribute.needsUpdate = true;
    }

    this.needsUpdate = false;

    const updateTime = performance.now() - startTime;
    // Only warn in development to avoid console spam in production
    if (updateTime > 10 && import.meta.env?.DEV) {
      console.warn(`LinkRenderer buffer update took ${updateTime.toFixed(2)}ms`);
    }
  }

  /**
   * Set link opacity
   * @param opacity Value between 0 and 1
   */
  public setOpacity(opacity: number): void {
    if (this.material) {
      this.material.opacity = Math.max(0, Math.min(1, opacity));
    }
  }

  /**
   * Set link color
   * @param color Color value (hex number or string)
   */
  public setColor(color: number | string): void {
    if (this.material) {
      this.material.color.set(color);
    }
  }

  /**
   * Force a buffer update on the next render
   */
  public forceUpdate(): void {
    this.needsUpdate = true;
    this.updateBuffer();
  }

  /**
   * Get statistics about the renderer
   */
  public getStats(): {
    totalLinks: number;
    visibleLinks: number;
    maxLinks: number;
    drawCalls: number;
  } {
    const renderedVertices = this.geometry ? this.geometry.drawRange.count : 0;
    const visibleLinks = Math.floor(renderedVertices / 2);

    return {
      totalLinks: this.links.length,
      visibleLinks,
      maxLinks: this.maxLinks,
      drawCalls: visibleLinks > 0 ? 1 : 0,
    };
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    if (this.lineSegments) {
      this.scene.remove(this.lineSegments);
    }
    if (this.geometry) {
      this.geometry.dispose();
      this.geometry = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    this.lineSegments = null;
    this.links = [];
    this.nodePositions.clear();
    this.visibleLinkIndices.clear();
  }
}
