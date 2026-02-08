import { describe, it, expect } from 'vitest';
import { EdgeBundler } from './EdgeBundler';
import type { GraphLink } from '../types/graph';
import * as THREE from 'three';

describe('EdgeBundler', () => {
  it('should create bundler with default config', () => {
    const bundler = new EdgeBundler();
    expect(bundler).toBeDefined();
  });

  it('should create bundler with custom config', () => {
    const bundler = new EdgeBundler({
      minLinksForBundle: 5,
      baseWidth: 1.0,
    });
    expect(bundler).toBeDefined();
  });

  it('should bundle links between same communities', () => {
    const bundler = new EdgeBundler({ minLinksForBundle: 2 });
    
    const links: GraphLink[] = [
      { source: 'node1', target: 'node2' },
      { source: 'node3', target: 'node4' },
      { source: 'node5', target: 'node6' },
    ];

    const nodeCommunities = new Map<string, number>([
      ['node1', 0],
      ['node2', 1],
      ['node3', 0],
      ['node4', 1],
      ['node5', 0],
      ['node6', 1],
    ]);

    const communityColors = new Map<number, string>([
      [0, 'hsl(0, 70%, 60%)'],
      [1, 'hsl(120, 70%, 60%)'],
    ]);

    const nodePositions = new Map<string, THREE.Vector3>([
      ['node1', new THREE.Vector3(0, 0, 0)],
      ['node2', new THREE.Vector3(10, 0, 0)],
      ['node3', new THREE.Vector3(1, 1, 0)],
      ['node4', new THREE.Vector3(11, 1, 0)],
      ['node5', new THREE.Vector3(0, -1, 0)],
      ['node6', new THREE.Vector3(10, -1, 0)],
    ]);

    const result = bundler.bundleLinks(
      links,
      nodeCommunities,
      communityColors,
      nodePositions
    );

    expect(result.bundles).toHaveLength(1);
    expect(result.bundles[0].count).toBe(3);
    expect(result.bundles[0].sourceCommunity).toBe(0);
    expect(result.bundles[0].targetCommunity).toBe(1);
    expect(result.unbundledLinks).toHaveLength(0);
  });

  it('should not bundle links below threshold', () => {
    const bundler = new EdgeBundler({ minLinksForBundle: 3 });
    
    const links: GraphLink[] = [
      { source: 'node1', target: 'node2' },
      { source: 'node3', target: 'node4' },
    ];

    const nodeCommunities = new Map<string, number>([
      ['node1', 0],
      ['node2', 1],
      ['node3', 0],
      ['node4', 1],
    ]);

    const communityColors = new Map<number, string>([
      [0, 'hsl(0, 70%, 60%)'],
      [1, 'hsl(120, 70%, 60%)'],
    ]);

    const nodePositions = new Map<string, THREE.Vector3>([
      ['node1', new THREE.Vector3(0, 0, 0)],
      ['node2', new THREE.Vector3(10, 0, 0)],
      ['node3', new THREE.Vector3(1, 1, 0)],
      ['node4', new THREE.Vector3(11, 1, 0)],
    ]);

    const result = bundler.bundleLinks(
      links,
      nodeCommunities,
      communityColors,
      nodePositions
    );

    expect(result.bundles).toHaveLength(0);
    expect(result.unbundledLinks).toHaveLength(2);
  });

  it('should calculate bundle width with logarithmic scaling', () => {
    const bundler = new EdgeBundler({ baseWidth: 1.0 });
    
    const width1 = bundler.calculateBundleWidth(10);
    const width2 = bundler.calculateBundleWidth(100);
    const width3 = bundler.calculateBundleWidth(1000);

    expect(width1).toBeGreaterThan(1);
    expect(width2).toBeGreaterThan(width1);
    expect(width3).toBeGreaterThan(width2);
    
    // Logarithmic scaling means each 10x increase adds 1 to the width
    // log10(10) = 1, log10(100) = 2, log10(1000) = 3
    expect(width1).toBeCloseTo(2.0, 1); // 1.0 * (1 + 1)
    expect(width2).toBeCloseTo(3.0, 1); // 1.0 * (1 + 2)
    expect(width3).toBeCloseTo(4.0, 1); // 1.0 * (1 + 3)
  });

  it('should create bundle geometry', () => {
    const bundler = new EdgeBundler();
    
    const bundle = {
      sourceCommunity: 0,
      targetCommunity: 1,
      links: [
        { source: 'node1', target: 'node2' },
        { source: 'node3', target: 'node4' },
      ],
      count: 2,
      color: 'hsl(60, 70%, 60%)',
      controlPoints: [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(5, 5, 0),
        new THREE.Vector3(10, 0, 0),
      ],
    };

    const geometry = bundler.createBundleGeometry(bundle);
    expect(geometry).toBeDefined();
    expect(geometry).toBeInstanceOf(THREE.TubeGeometry);
  });

  it('should create bundle mesh', () => {
    const bundler = new EdgeBundler();
    
    const bundle = {
      sourceCommunity: 0,
      targetCommunity: 1,
      links: [
        { source: 'node1', target: 'node2' },
      ],
      count: 1,
      color: 'hsl(60, 70%, 60%)',
      controlPoints: [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(5, 5, 0),
        new THREE.Vector3(10, 0, 0),
      ],
    };

    const mesh = bundler.createBundleMesh(bundle, 0.5);
    expect(mesh).toBeDefined();
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.userData.bundle).toBe(bundle);
  });

  it('should update bundler config', () => {
    const bundler = new EdgeBundler({ minLinksForBundle: 3 });
    
    bundler.updateConfig({ minLinksForBundle: 5, baseWidth: 2.0 });
    
    // Verify the update by testing bundle behavior
    const links: GraphLink[] = [
      { source: 'node1', target: 'node2' },
      { source: 'node3', target: 'node4' },
      { source: 'node5', target: 'node6' },
      { source: 'node7', target: 'node8' },
    ];

    const nodeCommunities = new Map<string, number>([
      ['node1', 0], ['node2', 1],
      ['node3', 0], ['node4', 1],
      ['node5', 0], ['node6', 1],
      ['node7', 0], ['node8', 1],
    ]);

    const communityColors = new Map<number, string>([
      [0, 'hsl(0, 70%, 60%)'],
      [1, 'hsl(120, 70%, 60%)'],
    ]);

    const nodePositions = new Map<string, THREE.Vector3>([
      ['node1', new THREE.Vector3(0, 0, 0)],
      ['node2', new THREE.Vector3(10, 0, 0)],
      ['node3', new THREE.Vector3(1, 1, 0)],
      ['node4', new THREE.Vector3(11, 1, 0)],
      ['node5', new THREE.Vector3(0, -1, 0)],
      ['node6', new THREE.Vector3(10, -1, 0)],
      ['node7', new THREE.Vector3(0, 2, 0)],
      ['node8', new THREE.Vector3(10, 2, 0)],
    ]);

    const result = bundler.bundleLinks(
      links,
      nodeCommunities,
      communityColors,
      nodePositions
    );

    // With minLinksForBundle=5, these 4 links should not bundle
    expect(result.bundles).toHaveLength(0);
    expect(result.unbundledLinks).toHaveLength(4);
  });

  it('should skip links without community assignment', () => {
    const bundler = new EdgeBundler({ minLinksForBundle: 2 });
    
    const links: GraphLink[] = [
      { source: 'node1', target: 'node2' },
      { source: 'node3', target: 'node4' }, // node4 has no community
    ];

    const nodeCommunities = new Map<string, number>([
      ['node1', 0],
      ['node2', 1],
      ['node3', 0],
      // node4 missing
    ]);

    const communityColors = new Map<number, string>([
      [0, 'hsl(0, 70%, 60%)'],
      [1, 'hsl(120, 70%, 60%)'],
    ]);

    const nodePositions = new Map<string, THREE.Vector3>([
      ['node1', new THREE.Vector3(0, 0, 0)],
      ['node2', new THREE.Vector3(10, 0, 0)],
      ['node3', new THREE.Vector3(1, 1, 0)],
      ['node4', new THREE.Vector3(11, 1, 0)],
    ]);

    const result = bundler.bundleLinks(
      links,
      nodeCommunities,
      communityColors,
      nodePositions
    );

    // Only one link can be bundled (needs at least 2, but only 1 has both communities)
    expect(result.bundles).toHaveLength(0);
  });
});
