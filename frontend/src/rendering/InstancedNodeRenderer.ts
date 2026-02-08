import * as THREE from 'three';

/**
 * InstancedNodeRenderer - High-performance node rendering using THREE.InstancedMesh
 * 
 * Renders all nodes of the same type in a single draw call using GPU instancing.
 * This dramatically reduces CPU overhead and improves performance for large graphs.
 * 
 * Key features:
 * - Single InstancedMesh per node type (max 4-5 draw calls)
 * - Position updates via instanceMatrix (no scene graph traversal)
 * - Per-instance colors via instanceColor attribute
 * - Per-instance sizes via scale in instance matrix
 * - Optimized for 100k+ nodes
 * 
 * Performance targets:
 * - <3 draw calls for rendering
 * - <5ms for position updates
 * - <500MB memory usage for 100k nodes
 * 
 * @example
 * ```typescript
 * const renderer = new InstancedNodeRenderer(scene, 100000);
 * 
 * // Set initial data
 * renderer.setNodeData(nodes);
 * 
 * // Update positions (from layout engine)
 * renderer.updatePositions(positions);
 * 
 * // Update colors
 * renderer.updateColors(colors);
 * 
 * // Raycast for interactions
 * const node = renderer.raycast(raycaster);
 * ```
 */

export interface NodeData {
  id: string;
  type: 'subreddit' | 'user' | 'post' | 'comment' | string;
  x?: number;
  y?: number;
  z?: number;
  size?: number;
  color?: string;
}

export interface InstancedNodeRendererConfig {
  maxNodes?: number;
  nodeRelSize?: number;
}

interface TypedMesh {
  mesh: THREE.InstancedMesh;
  nodeIds: string[];
  count: number;
}

const DEFAULT_COLORS: Record<string, THREE.Color> = {
  subreddit: new THREE.Color('#4ade80'),
  user: new THREE.Color('#60a5fa'),
  post: new THREE.Color('#f59e0b'),
  comment: new THREE.Color('#f43f5e'),
  default: new THREE.Color('#a78bfa'),
};

export class InstancedNodeRenderer {
  private scene: THREE.Scene;
  private geometry: THREE.SphereGeometry;
  private meshes: Map<string, TypedMesh> = new Map();
  private nodeMap: Map<string, { type: string; index: number }> = new Map();
  private maxNodes: number;
  private nodeRelSize: number;

  constructor(scene: THREE.Scene, config: InstancedNodeRendererConfig = {}) {
    this.scene = scene;
    this.maxNodes = config.maxNodes || 100000;
    this.nodeRelSize = config.nodeRelSize || 4;
    
    // Create shared geometry (8 segments for performance vs quality balance)
    this.geometry = new THREE.SphereGeometry(1, 8, 8);
  }

  /**
   * Set node data and create/update instanced meshes
   */
  public setNodeData(nodes: NodeData[]): void {
    // Group nodes by type
    const nodesByType = new Map<string, NodeData[]>();
    for (const node of nodes) {
      const type = node.type || 'default';
      if (!nodesByType.has(type)) {
        nodesByType.set(type, []);
      }
      nodesByType.get(type)!.push(node);
    }

    // Clear old node map
    this.nodeMap.clear();

    // Create or update meshes for each type
    for (const [type, typedNodes] of nodesByType.entries()) {
      this.createOrUpdateMeshForType(type, typedNodes);
    }

    // Remove meshes for types that no longer exist
    for (const [type, typedMesh] of this.meshes.entries()) {
      if (!nodesByType.has(type)) {
        this.scene.remove(typedMesh.mesh);
        typedMesh.mesh.geometry.dispose();
        (typedMesh.mesh.material as THREE.Material).dispose();
        this.meshes.delete(type);
      }
    }
  }

  /**
   * Create or update instanced mesh for a specific node type
   */
  private createOrUpdateMeshForType(type: string, nodes: NodeData[]): void {
    const count = Math.min(nodes.length, this.maxNodes);
    
    // Check if we need to recreate the mesh (different count)
    const existing = this.meshes.get(type);
    if (existing && existing.mesh.count !== count) {
      // Remove old mesh
      this.scene.remove(existing.mesh);
      existing.mesh.geometry.dispose();
      (existing.mesh.material as THREE.Material).dispose();
      this.meshes.delete(type);
    }

    let typedMesh: TypedMesh;
    
    if (!this.meshes.has(type)) {
      // Create new mesh
      const material = new THREE.MeshLambertMaterial({
        color: DEFAULT_COLORS[type] || DEFAULT_COLORS.default,
      });
      
      const mesh = new THREE.InstancedMesh(this.geometry, material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Will be updated frequently
      
      // Enable per-instance colors
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(count * 3),
        3
      );
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      
      this.scene.add(mesh);
      
      typedMesh = {
        mesh,
        nodeIds: new Array(count),
        count: 0,
      };
      
      this.meshes.set(type, typedMesh);
    } else {
      typedMesh = this.meshes.get(type)!;
      typedMesh.count = 0;
    }

    // Set positions, colors, and scales for each node
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      
      // Store node mapping
      this.nodeMap.set(node.id, { type, index: i });
      typedMesh.nodeIds[i] = node.id;
      
      // Set position
      position.set(node.x || 0, node.y || 0, node.z || 0);
      
      // Set scale based on node size
      const size = (node.size || 1) * this.nodeRelSize;
      scale.set(size, size, size);
      
      // Create matrix
      matrix.compose(position, rotation, scale);
      typedMesh.mesh.setMatrixAt(i, matrix);
      
      // Set color
      if (node.color) {
        color.set(node.color);
      } else {
        color.copy(DEFAULT_COLORS[type] || DEFAULT_COLORS.default);
      }
      typedMesh.mesh.setColorAt(i, color);
    }

    typedMesh.count = count;
    typedMesh.mesh.instanceMatrix.needsUpdate = true;
    if (typedMesh.mesh.instanceColor) {
      typedMesh.mesh.instanceColor.needsUpdate = true;
    }
    typedMesh.mesh.computeBoundingSphere();
  }

  /**
   * Update positions for all nodes
   * @param positions Map of node ID to position
   */
  public updatePositions(positions: Map<string, { x: number; y: number; z: number }>): void {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (const [, typedMesh] of this.meshes.entries()) {
      let updated = false;

      for (let i = 0; i < typedMesh.count; i++) {
        const nodeId = typedMesh.nodeIds[i];
        const pos = positions.get(nodeId);
        
        if (pos) {
          // Get current matrix to preserve scale
          typedMesh.mesh.getMatrixAt(i, matrix);
          matrix.decompose(position, rotation, scale);
          
          // Update position
          position.set(pos.x, pos.y, pos.z);
          matrix.compose(position, rotation, scale);
          typedMesh.mesh.setMatrixAt(i, matrix);
          
          updated = true;
        }
      }

      if (updated) {
        typedMesh.mesh.instanceMatrix.needsUpdate = true;
        typedMesh.mesh.computeBoundingSphere();
      }
    }
  }

  /**
   * Update colors for specific nodes
   * @param colors Map of node ID to color
   */
  public updateColors(colors: Map<string, string | THREE.Color>): void {
    const color = new THREE.Color();

    for (const [nodeId, colorValue] of colors.entries()) {
      const nodeInfo = this.nodeMap.get(nodeId);
      if (!nodeInfo) continue;

      const typedMesh = this.meshes.get(nodeInfo.type);
      if (!typedMesh || !typedMesh.mesh.instanceColor) continue;

      if (typeof colorValue === 'string') {
        color.set(colorValue);
      } else {
        color.copy(colorValue);
      }

      typedMesh.mesh.setColorAt(nodeInfo.index, color);
      typedMesh.mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Update size for specific nodes
   * @param sizes Map of node ID to size
   */
  public updateSizes(sizes: Map<string, number>): void {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    const updatedTypes = new Set<string>();

    for (const [nodeId, size] of sizes.entries()) {
      const nodeInfo = this.nodeMap.get(nodeId);
      if (!nodeInfo) continue;

      const typedMesh = this.meshes.get(nodeInfo.type);
      if (!typedMesh) continue;

      // Get current matrix
      typedMesh.mesh.getMatrixAt(nodeInfo.index, matrix);
      matrix.decompose(position, rotation, scale);

      // Update scale
      const newSize = size * this.nodeRelSize;
      scale.set(newSize, newSize, newSize);
      matrix.compose(position, rotation, scale);
      typedMesh.mesh.setMatrixAt(nodeInfo.index, matrix);

      updatedTypes.add(nodeInfo.type);
    }

    // Mark updated meshes
    for (const type of updatedTypes) {
      const typedMesh = this.meshes.get(type);
      if (typedMesh) {
        typedMesh.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /**
   * Raycast to find intersected node
   * @returns Node ID if intersected, null otherwise
   */
  public raycast(raycaster: THREE.Raycaster): string | null {
    let closestDistance = Infinity;
    let closestNodeId: string | null = null;

    for (const [, typedMesh] of this.meshes.entries()) {
      const intersects = raycaster.intersectObject(typedMesh.mesh, false);
      
      for (const intersect of intersects) {
        if (intersect.distance < closestDistance && intersect.instanceId !== undefined) {
          closestDistance = intersect.distance;
          closestNodeId = typedMesh.nodeIds[intersect.instanceId];
        }
      }
    }

    return closestNodeId;
  }

  /**
   * Get node position by ID
   */
  public getNodePosition(nodeId: string): { x: number; y: number; z: number } | null {
    const nodeInfo = this.nodeMap.get(nodeId);
    if (!nodeInfo) return null;

    const typedMesh = this.meshes.get(nodeInfo.type);
    if (!typedMesh) return null;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    typedMesh.mesh.getMatrixAt(nodeInfo.index, matrix);
    matrix.decompose(position, rotation, scale);

    return { x: position.x, y: position.y, z: position.z };
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    for (const [, typedMesh] of this.meshes.entries()) {
      this.scene.remove(typedMesh.mesh);
      typedMesh.mesh.geometry.dispose();
      (typedMesh.mesh.material as THREE.Material).dispose();
    }
    this.meshes.clear();
    this.nodeMap.clear();
    this.geometry.dispose();
  }

  /**
   * Get statistics about the renderer
   */
  public getStats(): {
    totalNodes: number;
    drawCalls: number;
    types: string[];
  } {
    return {
      totalNodes: this.nodeMap.size,
      drawCalls: this.meshes.size,
      types: Array.from(this.meshes.keys()),
    };
  }
}
