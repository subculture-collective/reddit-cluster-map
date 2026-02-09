import * as THREE from 'three';

/**
 * InstancedNodeRenderer - High-performance node rendering using THREE.InstancedMesh
 * 
 * Renders all nodes of the same type in a single draw call using GPU instancing.
 * This dramatically reduces CPU overhead and improves performance for large graphs.
 * 
 * Key features:
 * - Single InstancedMesh per node type (typically 4 draw calls for core node types)
 * - Position updates via instanceMatrix (no scene graph traversal)
 * - Per-instance colors via instanceColor attribute
 * - Per-instance sizes via scale in instance matrix
 * - Optimized for 100k+ nodes
 * 
 * Performance targets:
 * - ~4 draw calls for core node types (plus extras for links/labels as configured)
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
  sizeAttenuation?: boolean;
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
  private sizeAttenuation: boolean;
  private camera: THREE.Camera | null = null;
  private cameraPosVector: THREE.Vector3 = new THREE.Vector3(); // Reusable vector to avoid per-frame allocation

  constructor(scene: THREE.Scene, config: InstancedNodeRendererConfig = {}) {
    this.scene = scene;
    this.maxNodes = config.maxNodes || 100000;
    this.nodeRelSize = config.nodeRelSize || 4;
    this.sizeAttenuation = config.sizeAttenuation !== undefined ? config.sizeAttenuation : true;
    
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
        // Only dispose material, not shared geometry
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
      // Only dispose material, not shared geometry
      (existing.mesh.material as THREE.Material).dispose();
      this.meshes.delete(type);
    }

    let typedMesh: TypedMesh;
    
    if (!this.meshes.has(type)) {
      // Create new mesh
      const material = this.createMaterial(type);
      
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
   * Set camera reference for distance-based scaling
   */
  public setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Update size attenuation setting
   */
  public setSizeAttenuation(enabled: boolean): void {
    if (this.sizeAttenuation === enabled) return;
    this.sizeAttenuation = enabled;
    
    // Recreate materials for all meshes
    for (const [type, typedMesh] of this.meshes.entries()) {
      const oldMaterial = typedMesh.mesh.material as THREE.Material;
      const material = this.createMaterial(type);
      typedMesh.mesh.material = material;
      oldMaterial.dispose();
    }
  }

  /**
   * Create material for a node type with optional distance-based scaling
   */
  private createMaterial(type: string): THREE.Material {
    if (!this.sizeAttenuation) {
      // Use standard material without distance scaling
      return new THREE.MeshLambertMaterial({
        color: DEFAULT_COLORS[type] || DEFAULT_COLORS.default,
      });
    }

    // Create custom shader material with distance-based scaling
    const baseColor = DEFAULT_COLORS[type] || DEFAULT_COLORS.default;
    
    return new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: baseColor },
        cameraPosition: { value: new THREE.Vector3() },
        attenuationFactor: { value: 0.3 }, // Controls how much size changes with distance
        minScale: { value: 0.3 }, // Minimum scale factor (prevent nodes from becoming too small)
        maxScale: { value: 2.0 }, // Maximum scale factor (prevent nodes from becoming too large)
      },
      vertexShader: `
        uniform vec3 cameraPosition;
        uniform float attenuationFactor;
        uniform float minScale;
        uniform float maxScale;
        
        attribute vec3 instanceColor;
        varying vec3 vColor;
        varying vec3 vNormal;
        
        void main() {
          vColor = instanceColor;
          vNormal = normalize(normalMatrix * normal);
          
          // Compute instance center in world space (local origin transformed by instance matrix)
          vec4 instanceCenter = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          
          // Calculate distance from camera using instance center so scale is uniform per instance
          float dist = length(cameraPosition - instanceCenter.xyz);
          
          // Apply logarithmic attenuation for smooth scaling
          // log(1 + x) provides smooth falloff, scaled by attenuationFactor
          float scaleFactor = 1.0 + attenuationFactor * log(1.0 + dist / 100.0);
          scaleFactor = clamp(scaleFactor, minScale, maxScale);
          
          // Apply uniform scale to the instance's local vertex position, then transform to world space
          vec3 scaledPosition = position * scaleFactor;
          vec4 worldPosition = instanceMatrix * vec4(scaledPosition, 1.0);
          
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        varying vec3 vColor;
        varying vec3 vNormal;
        
        void main() {
          // Simple Lambertian shading
          vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
          float diff = max(dot(vNormal, lightDir), 0.0);
          
          // Mix instance color with base color
          vec3 color = mix(baseColor, vColor, step(0.01, length(vColor)));
          
          // Apply lighting
          vec3 ambient = color * 0.6;
          vec3 diffuse = color * 0.4 * diff;
          
          gl_FragColor = vec4(ambient + diffuse, 1.0);
        }
      `,
      lights: false, // We handle lighting in the shader
    });
  }

  /**
   * Update camera position in shader uniforms (call this each frame)
   */
  public updateCameraPosition(): void {
    if (!this.camera || !this.sizeAttenuation) return;
    
    // Reuse the cached vector to avoid per-frame allocation
    this.camera.getWorldPosition(this.cameraPosVector);
    
    for (const [, typedMesh] of this.meshes.entries()) {
      const material = typedMesh.mesh.material;
      if (material instanceof THREE.ShaderMaterial && material.uniforms.cameraPosition) {
        material.uniforms.cameraPosition.value.copy(this.cameraPosVector);
      }
    }
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    for (const [, typedMesh] of this.meshes.entries()) {
      this.scene.remove(typedMesh.mesh);
      // Only dispose material, not geometry (shared across all meshes)
      (typedMesh.mesh.material as THREE.Material).dispose();
    }
    this.meshes.clear();
    this.nodeMap.clear();
    // Dispose shared geometry once after all meshes are cleared
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
