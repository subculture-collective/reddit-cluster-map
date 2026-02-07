import type { GraphLink } from '../types/graph';
import * as THREE from 'three';

/**
 * EdgeBundler - Reduces visual clutter in dense graphs by bundling links
 * 
 * This module groups links between the same communities into aggregated curved paths,
 * reducing the number of rendered lines and improving graph readability.
 * 
 * Key features:
 * - Groups links by source/target community pairs
 * - Renders bundles as curved tubes using THREE.js
 * - Bundle thickness scales logarithmically with link count
 * - Blends community colors for bundle visualization
 * 
 * Performance impact:
 * - Can reduce link count by 10-50x for dense graphs
 * - Reduces draw calls significantly
 * - Uses GPU-efficient THREE.TubeGeometry
 * 
 * @example
 * ```typescript
 * const bundler = new EdgeBundler({ minLinksForBundle: 3 });
 * const { bundles, unbundledLinks } = bundler.bundleLinks(
 *   links,
 *   nodeCommunities,
 *   communityColors,
 *   nodePositions
 * );
 * 
 * // Create THREE.js meshes for rendering
 * bundles.forEach(bundle => {
 *   const mesh = bundler.createBundleMesh(bundle, 0.6);
 *   scene.add(mesh);
 * });
 * ```
 */

/**
 * Represents a bundle of links between two communities
 */
export interface LinkBundle {
  sourceCommunity: number;
  targetCommunity: number;
  links: GraphLink[];
  count: number;
  color: string;
  controlPoints: THREE.Vector3[];
}

/**
 * Configuration for edge bundling
 */
export interface EdgeBundlerConfig {
  /** Minimum number of links to create a bundle (default: 3) */
  minLinksForBundle: number;
  /** Base width for bundle rendering (default: 0.5) */
  baseWidth: number;
  /** Number of segments for the curved path (default: 16) */
  curveSegments: number;
  /** How much to curve the bundle (0-1, default: 0.3) */
  curvature: number;
}

const DEFAULT_CONFIG: EdgeBundlerConfig = {
  minLinksForBundle: 3,
  baseWidth: 0.5,
  curveSegments: 16,
  curvature: 0.3,
};

/**
 * Groups links between communities into visual bundles
 */
export class EdgeBundler {
  private config: EdgeBundlerConfig;

  constructor(config: Partial<EdgeBundlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Identify which links would be bundled (without calculating geometry)
   * Useful for hiding individual bundled links in the UI
   */
  public identifyBundledLinks(
    links: GraphLink[],
    nodeCommunities: Map<string, number>
  ): Set<GraphLink> {
    const communityPairs = new Map<string, GraphLink[]>();
    
    for (const link of links) {
      const sourceCommunity = nodeCommunities.get(link.source);
      const targetCommunity = nodeCommunities.get(link.target);
      
      if (sourceCommunity === undefined || targetCommunity === undefined) {
        continue;
      }
      
      const key = this.getCommunityPairKey(sourceCommunity, targetCommunity);
      
      if (!communityPairs.has(key)) {
        communityPairs.set(key, []);
      }
      communityPairs.get(key)!.push(link);
    }
    
    const bundledLinks = new Set<GraphLink>();
    
    for (const [, pairLinks] of communityPairs) {
      if (pairLinks.length >= this.config.minLinksForBundle) {
        for (const link of pairLinks) {
          bundledLinks.add(link);
        }
      }
    }
    
    return bundledLinks;
  }

  /**
   * Bundle links based on their source and target communities
   */
  public bundleLinks(
    links: GraphLink[],
    nodeCommunities: Map<string, number>,
    communityColors: Map<number, string>,
    nodePositions: Map<string, THREE.Vector3>
  ): {
    bundles: LinkBundle[];
    unbundledLinks: GraphLink[];
  } {
    // Group links by community pairs
    const communityPairs = new Map<string, GraphLink[]>();

    for (const link of links) {
      const sourceCommunity = nodeCommunities.get(link.source);
      const targetCommunity = nodeCommunities.get(link.target);

      // Skip links without community assignment
      if (sourceCommunity === undefined || targetCommunity === undefined) {
        continue;
      }

      // Create a consistent key for the community pair
      const key = this.getCommunityPairKey(sourceCommunity, targetCommunity);
      
      if (!communityPairs.has(key)) {
        communityPairs.set(key, []);
      }
      communityPairs.get(key)!.push(link);
    }

    const bundles: LinkBundle[] = [];
    const unbundledLinks: GraphLink[] = [];

    // Add links without community assignments to unbundledLinks
    for (const link of links) {
      const sourceCommunity = nodeCommunities.get(link.source);
      const targetCommunity = nodeCommunities.get(link.target);
      
      if (sourceCommunity === undefined || targetCommunity === undefined) {
        unbundledLinks.push(link);
      }
    }

    // Process each community pair
    for (const [key, pairLinks] of communityPairs) {
      if (pairLinks.length >= this.config.minLinksForBundle) {
        // Create a bundle
        const [sourceCommunity, targetCommunity] = this.parseCommunityPairKey(key);
        
        // Calculate bundle path control points
        const controlPoints = this.calculateBundlePath(
          pairLinks,
          nodePositions
        );

        // Blend colors from both communities
        const color = this.blendCommunityColors(
          sourceCommunity,
          targetCommunity,
          communityColors
        );

        bundles.push({
          sourceCommunity,
          targetCommunity,
          links: pairLinks,
          count: pairLinks.length,
          color,
          controlPoints,
        });
      } else {
        // Keep as individual links
        unbundledLinks.push(...pairLinks);
      }
    }

    return { bundles, unbundledLinks };
  }

  /**
   * Calculate the path for a bundle using spline interpolation
   */
  private calculateBundlePath(
    links: GraphLink[],
    nodePositions: Map<string, THREE.Vector3>
  ): THREE.Vector3[] {
    // Calculate average positions for source and target nodes
    const sourcePositions: THREE.Vector3[] = [];
    const targetPositions: THREE.Vector3[] = [];

    for (const link of links) {
      const sourcePos = nodePositions.get(link.source);
      const targetPos = nodePositions.get(link.target);

      if (sourcePos) sourcePositions.push(sourcePos);
      if (targetPos) targetPositions.push(targetPos);
    }

    if (sourcePositions.length === 0 || targetPositions.length === 0) {
      return [];
    }

    // Calculate centroids
    const sourceCentroid = this.calculateCentroid(sourcePositions);
    const targetCentroid = this.calculateCentroid(targetPositions);

    // Create control points for a curved path
    const midpoint = new THREE.Vector3()
      .addVectors(sourceCentroid, targetCentroid)
      .multiplyScalar(0.5);

    // Calculate perpendicular offset for curvature
    const direction = new THREE.Vector3()
      .subVectors(targetCentroid, sourceCentroid);
    
    const distance = direction.length();
    direction.normalize();

    // Create a perpendicular vector using cross product
    // Use the world up vector as reference, but handle the case where direction is parallel to up
    const up = new THREE.Vector3(0, 1, 0);
    const perpendicular = new THREE.Vector3();
    
    // Check if direction is nearly parallel to up vector
    if (Math.abs(direction.dot(up)) > 0.99) {
      // Use right vector instead
      perpendicular.crossVectors(direction, new THREE.Vector3(1, 0, 0));
    } else {
      perpendicular.crossVectors(direction, up);
    }
    
    perpendicular.normalize();
    const offset = perpendicular.multiplyScalar(distance * this.config.curvature);

    const controlPoint = new THREE.Vector3().addVectors(midpoint, offset);

    return [sourceCentroid, controlPoint, targetCentroid];
  }

  /**
   * Calculate the centroid of a set of positions
   */
  private calculateCentroid(positions: THREE.Vector3[]): THREE.Vector3 {
    const centroid = new THREE.Vector3();
    for (const pos of positions) {
      centroid.add(pos);
    }
    centroid.divideScalar(positions.length);
    return centroid;
  }

  /**
   * Create a consistent key for a community pair (order-independent)
   */
  private getCommunityPairKey(comm1: number, comm2: number): string {
    return comm1 <= comm2 ? `${comm1}-${comm2}` : `${comm2}-${comm1}`;
  }

  /**
   * Parse a community pair key back to community IDs
   */
  private parseCommunityPairKey(key: string): [number, number] {
    const [comm1, comm2] = key.split('-').map(Number);
    return [comm1, comm2];
  }

  /**
   * Blend colors from two communities
   */
  private blendCommunityColors(
    comm1: number,
    comm2: number,
    communityColors: Map<number, string>
  ): string {
    const color1Str = communityColors.get(comm1);
    const color2Str = communityColors.get(comm2);

    // If we don't have both colors, return a default
    if (!color1Str || !color2Str) {
      return '#999999';
    }

    // Parse HSL colors and blend them
    const hsl1 = this.parseHSL(color1Str);
    const hsl2 = this.parseHSL(color2Str);

    if (!hsl1 || !hsl2) {
      return '#999999';
    }

    // Blend by averaging
    const blendedH = (hsl1.h + hsl2.h) / 2;
    const blendedS = (hsl1.s + hsl2.s) / 2;
    const blendedL = (hsl1.l + hsl2.l) / 2;

    return `hsl(${blendedH}, ${blendedS}%, ${blendedL}%)`;
  }

  /**
   * Parse HSL color string
   */
  private parseHSL(colorStr: string): { h: number; s: number; l: number } | null {
    // Support decimal hue values (e.g., 137.5 from golden-angle community colors)
    const match = colorStr.match(/hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
    if (!match) return null;

    return {
      h: parseFloat(match[1]),
      s: parseFloat(match[2]),
      l: parseFloat(match[3]),
    };
  }

  /**
   * Calculate the width for a bundle based on link count
   */
  public calculateBundleWidth(linkCount: number): number {
    // Use logarithmic scaling for bundle width
    return this.config.baseWidth * (1 + Math.log10(linkCount));
  }

  /**
   * Create a THREE.js geometry for a bundle
   */
  public createBundleGeometry(bundle: LinkBundle): THREE.TubeGeometry {
    if (bundle.controlPoints.length < 2) {
      // Fallback: create a simple line
      const points = [new THREE.Vector3(), new THREE.Vector3(0, 0, 1)];
      const curve = new THREE.CatmullRomCurve3(points);
      return new THREE.TubeGeometry(curve, this.config.curveSegments, 0.1, 8, false);
    }

    // Create a curve from control points
    const curve = new THREE.CatmullRomCurve3(bundle.controlPoints);

    // Calculate width
    const width = this.calculateBundleWidth(bundle.count);

    // Create tube geometry
    return new THREE.TubeGeometry(
      curve,
      this.config.curveSegments,
      width,
      8, // radial segments
      false // closed
    );
  }

  /**
   * Create a THREE.js mesh for a bundle
   */
  public createBundleMesh(
    bundle: LinkBundle,
    opacity: number = 0.6
  ): THREE.Mesh {
    const geometry = this.createBundleGeometry(bundle);
    
    const material = new THREE.MeshBasicMaterial({
      color: bundle.color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    
    // Store bundle data for interaction using THREE.Object3D.userData
    mesh.userData = { ...(mesh.userData || {}), bundle };

    return mesh;
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<EdgeBundlerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
