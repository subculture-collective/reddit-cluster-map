import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { InstancedNodeRenderer } from './InstancedNodeRenderer';
import { ForceSimulation } from './ForceSimulation';

describe('Integration: InstancedNodeRenderer + ForceSimulation', () => {
  let scene: THREE.Scene;
  let renderer: InstancedNodeRenderer;
  let simulation: ForceSimulation;

  beforeEach(() => {
    scene = new THREE.Scene();
    renderer = new InstancedNodeRenderer(scene, { maxNodes: 1000, nodeRelSize: 4 });
  });

  it('should integrate renderer with simulation', (done) => {
    const nodes = [
      { id: 'node1', type: 'subreddit', name: 'r/test1' },
      { id: 'node2', type: 'user', name: 'u/user1' },
      { id: 'node3', type: 'post', name: 'Post 1' },
    ];

    const links = [
      { source: 'node1', target: 'node2' },
      { source: 'node2', target: 'node3' },
    ];

    // Set up simulation with callback
    let tickCount = 0;
    simulation = new ForceSimulation({
      onTick: (positions) => {
        renderer.updatePositions(positions);
        tickCount++;
        
        // After a few ticks, verify positions were updated
        if (tickCount > 5) {
          const pos1 = renderer.getNodePosition('node1');
          expect(pos1).not.toBeNull();
          expect(typeof pos1?.x).toBe('number');
          
          simulation.stop();
          renderer.dispose();
          done();
        }
      },
      physics: {
        chargeStrength: -30,
        linkDistance: 30,
        velocityDecay: 0.4,
        cooldownTicks: 10,
      },
    });

    // Initialize renderer with nodes
    renderer.setNodeData(nodes.map(n => ({
      id: n.id,
      type: n.type as any,
      x: Math.random() * 100,
      y: Math.random() * 100,
      z: Math.random() * 100,
      size: 2,
    })));

    // Set simulation data and start
    simulation.setData(nodes, links);
    simulation.start();
  }, 2000);

  it('should handle precomputed positions', () => {
    const nodes = [
      { id: 'node1', type: 'subreddit', name: 'r/test1', x: 10, y: 20, z: 30, val: 5 },
      { id: 'node2', type: 'user', name: 'u/user1', x: 40, y: 50, z: 60, val: 3 },
    ];

    const links = [
      { source: 'node1', target: 'node2' },
    ];

    let receivedPositions = false;
    simulation = new ForceSimulation({
      onTick: (positions) => {
        renderer.updatePositions(positions);
        receivedPositions = true;
      },
      usePrecomputedPositions: true,
    });

    // Initialize renderer
    renderer.setNodeData(nodes.map(n => ({
      id: n.id,
      type: n.type as any,
      x: n.x,
      y: n.y,
      z: n.z,
      size: 2,
    })));

    // Set simulation data
    simulation.setData(nodes, links);

    // Verify precomputed positions are used
    const stats = simulation.getStats();
    expect(stats.hasPrecomputedPositions).toBe(true);

    // Verify positions
    expect(receivedPositions).toBe(true);
    const pos1 = renderer.getNodePosition('node1');
    expect(pos1).toEqual({ x: 10, y: 20, z: 30 });

    simulation.dispose();
    renderer.dispose();
  });

  it('should render different node types with correct draw calls', () => {
    const nodes = [];
    const types = ['subreddit', 'user', 'post', 'comment'];
    
    // Create 1000 nodes with different types
    for (let i = 0; i < 1000; i++) {
      nodes.push({
        id: `node${i}`,
        type: types[i % 4] as any,
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        z: Math.random() * 1000,
        size: 2,
      });
    }

    renderer.setNodeData(nodes);
    const stats = renderer.getStats();

    expect(stats.totalNodes).toBe(1000);
    expect(stats.drawCalls).toBe(4); // One per type
    expect(stats.types).toHaveLength(4);
    expect(stats.types).toContain('subreddit');
    expect(stats.types).toContain('user');
    expect(stats.types).toContain('post');
    expect(stats.types).toContain('comment');

    renderer.dispose();
  });

  it('should handle color updates from community detection', () => {
    const nodes = [
      { id: 'node1', type: 'subreddit' as any, x: 0, y: 0, z: 0, size: 2, color: '#ff0000' },
      { id: 'node2', type: 'user' as any, x: 1, y: 1, z: 1, size: 2, color: '#00ff00' },
      { id: 'node3', type: 'post' as any, x: 2, y: 2, z: 2, size: 2, color: '#0000ff' },
    ];

    renderer.setNodeData(nodes);

    // Update colors
    const newColors = new Map([
      ['node1', '#ffff00'],
      ['node2', '#ff00ff'],
    ]);

    renderer.updateColors(newColors);

    // Verify (can't easily test color values, but ensure it doesn't throw)
    expect(() => renderer.getStats()).not.toThrow();

    renderer.dispose();
  });
});
