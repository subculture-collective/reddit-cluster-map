import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ForceSimulation, type PhysicsConfig } from './ForceSimulation';
import type { GraphNode, GraphLink } from '../types/graph';

describe('ForceSimulation with Web Worker', () => {
  let simulation: ForceSimulation;
  let tickCallbackMock: (positions: Map<string, { x: number; y: number; z: number }>) => void;

  beforeEach(() => {
    tickCallbackMock = vi.fn();
  });

  afterEach(() => {
    if (simulation) {
      simulation.dispose();
    }
  });

  describe('initialization', () => {
    it('should create a simulation with default config', () => {
      simulation = new ForceSimulation();
      expect(simulation).toBeDefined();
      
      const stats = simulation.getStats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.linkCount).toBe(0);
    });

    it('should accept custom config', () => {
      const physics: PhysicsConfig = {
        chargeStrength: -50,
        linkDistance: 40,
        velocityDecay: 0.5,
      };
      
      simulation = new ForceSimulation({
        onTick: tickCallbackMock,
        physics,
      });
      
      expect(simulation).toBeDefined();
    });

    it('should report worker usage in stats', () => {
      simulation = new ForceSimulation();
      const stats = simulation.getStats();
      
      // Worker may or may not be available depending on environment
      expect(typeof stats.useWorker).toBe('boolean');
    });
  });

  describe('setData', () => {
    it('should handle empty graph', () => {
      simulation = new ForceSimulation({ onTick: tickCallbackMock });
      
      simulation.setData([], []);
      
      const stats = simulation.getStats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.linkCount).toBe(0);
    });

    it('should process nodes and links', () => {
      const nodes: GraphNode[] = [
        { id: 'node1', name: 'Node 1', type: 'subreddit', val: 100 },
        { id: 'node2', name: 'Node 2', type: 'user', val: 50 },
        { id: 'node3', name: 'Node 3', type: 'post', val: 10 },
      ];
      
      const links: GraphLink[] = [
        { source: 'node1', target: 'node2' },
        { source: 'node2', target: 'node3' },
      ];
      
      simulation = new ForceSimulation({ onTick: tickCallbackMock });
      simulation.setData(nodes, links);
      
      const stats = simulation.getStats();
      expect(stats.nodeCount).toBe(3);
      expect(stats.linkCount).toBe(2);
    });

    it('should detect precomputed positions', () => {
      const nodes: GraphNode[] = [
        { id: 'node1', name: 'Node 1', type: 'subreddit', x: 10, y: 20, z: 30 },
        { id: 'node2', name: 'Node 2', type: 'user', x: 40, y: 50, z: 60 },
        { id: 'node3', name: 'Node 3', type: 'post', x: 70, y: 80, z: 90 },
      ];
      
      const links: GraphLink[] = [
        { source: 'node1', target: 'node2' },
      ];
      
      simulation = new ForceSimulation({
        onTick: tickCallbackMock,
        usePrecomputedPositions: true,
      });
      
      simulation.setData(nodes, links);
      
      const stats = simulation.getStats();
      expect(stats.hasPrecomputedPositions).toBe(true);
    });

    it('should handle partially precomputed positions', () => {
      const nodes: GraphNode[] = [
        { id: 'node1', name: 'Node 1', type: 'subreddit', x: 10, y: 20, z: 30 },
        { id: 'node2', name: 'Node 2', type: 'user' }, // No position
        { id: 'node3', name: 'Node 3', type: 'post', x: 70, y: 80, z: 90 },
      ];
      
      const links: GraphLink[] = [];
      
      simulation = new ForceSimulation({
        onTick: tickCallbackMock,
        usePrecomputedPositions: true,
      });
      
      simulation.setData(nodes, links);
      
      const stats = simulation.getStats();
      // Should not treat as precomputed if less than 70% have positions
      expect(stats.hasPrecomputedPositions).toBe(false);
    });
  });

  describe('node position operations', () => {
    beforeEach(() => {
      const nodes: GraphNode[] = [
        { id: 'node1', name: 'Node 1', type: 'subreddit', x: 0, y: 0, z: 0 },
        { id: 'node2', name: 'Node 2', type: 'user', x: 10, y: 10, z: 10 },
      ];
      
      simulation = new ForceSimulation();
      simulation.setData(nodes, []);
    });

    it('should get node position', () => {
      const pos = simulation.getNodePosition('node1');
      expect(pos).toBeDefined();
      expect(pos?.x).toBeDefined();
      expect(pos?.y).toBeDefined();
      expect(pos?.z).toBeDefined();
    });

    it('should return null for non-existent node', () => {
      const pos = simulation.getNodePosition('nonexistent');
      expect(pos).toBeNull();
    });

    it('should set node position', () => {
      simulation.setNodePosition('node1', { x: 100, y: 200, z: 300 });
      const pos = simulation.getNodePosition('node1');
      
      expect(pos).toEqual({ x: 100, y: 200, z: 300 });
    });

    it('should release fixed node position', () => {
      simulation.setNodePosition('node1', { x: 100, y: 200, z: 300 });
      simulation.releaseNode('node1');
      
      // Position should still be at the set location, but no longer fixed
      const pos = simulation.getNodePosition('node1');
      expect(pos).toBeDefined();
    });
  });

  describe('physics updates', () => {
    it('should update physics configuration', () => {
      const nodes: GraphNode[] = [
        { id: 'node1', name: 'Node 1', type: 'subreddit' },
        { id: 'node2', name: 'Node 2', type: 'user' },
      ];
      
      const links: GraphLink[] = [
        { source: 'node1', target: 'node2' },
      ];
      
      const initialPhysics: PhysicsConfig = {
        chargeStrength: -30,
        linkDistance: 30,
        velocityDecay: 0.4,
      };
      
      simulation = new ForceSimulation({
        onTick: tickCallbackMock,
        physics: initialPhysics,
      });
      
      simulation.setData(nodes, links);
      
      // Update physics
      const newPhysics: PhysicsConfig = {
        chargeStrength: -50,
        linkDistance: 50,
        velocityDecay: 0.6,
        collisionRadius: 5,
      };
      
      // Should not throw
      expect(() => simulation.updatePhysics(newPhysics)).not.toThrow();
    });
  });

  describe('lifecycle', () => {
    it('should start simulation', () => {
      const nodes: GraphNode[] = [
        { id: 'node1', name: 'Node 1', type: 'subreddit' },
      ];
      
      simulation = new ForceSimulation({ onTick: tickCallbackMock });
      simulation.setData(nodes, []);
      
      // Should not throw
      expect(() => simulation.start()).not.toThrow();
    });

    it('should stop simulation', () => {
      const nodes: GraphNode[] = [
        { id: 'node1', name: 'Node 1', type: 'subreddit' },
      ];
      
      simulation = new ForceSimulation({ onTick: tickCallbackMock });
      simulation.setData(nodes, []);
      simulation.start();
      
      // Should not throw
      expect(() => simulation.stop()).not.toThrow();
    });

    it('should dispose cleanly', () => {
      const nodes: GraphNode[] = [
        { id: 'node1', name: 'Node 1', type: 'subreddit' },
        { id: 'node2', name: 'Node 2', type: 'user' },
      ];
      
      const links: GraphLink[] = [
        { source: 'node1', target: 'node2' },
      ];
      
      simulation = new ForceSimulation({ onTick: tickCallbackMock });
      simulation.setData(nodes, links);
      simulation.start();
      
      // Should not throw
      expect(() => simulation.dispose()).not.toThrow();
      
      // After disposal, stats should show empty simulation
      const stats = simulation.getStats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.linkCount).toBe(0);
    });
  });
});
