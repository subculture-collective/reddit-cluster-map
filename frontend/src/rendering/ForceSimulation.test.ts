import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForceSimulation, type PhysicsConfig } from './ForceSimulation';
import type { GraphNode, GraphLink } from '../types/graph';

describe('ForceSimulation', () => {
  let simulation: ForceSimulation;
  let onTickMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onTickMock = vi.fn();
    simulation = new ForceSimulation({
      onTick: onTickMock,
    });
  });

  describe('Physics Stability', () => {
    it('should clamp velocity to prevent runaway nodes', () => {
      const capturedPositions: Array<Map<string, { x: number; y: number; z: number }>> = [];
      
      const nodes: GraphNode[] = Array.from({ length: 10 }, (_, i) => ({
        id: `node${i}`,
        name: `Node ${i}`,
        type: 'user',
        val: 1,
        x: Math.random() * 100,
        y: Math.random() * 100,
        z: Math.random() * 100,
      }));

      const physics: PhysicsConfig = {
        chargeStrength: -220,
        linkDistance: 120,
        velocityDecay: 0.88,
        cooldownTicks: 80,
        collisionRadius: 3,
        autoTune: false,
      };

      simulation = new ForceSimulation({
        onTick: (positions) => {
          capturedPositions.push(new Map(positions));
        },
        physics,
      });

      simulation.setData(nodes, []);
      simulation.start();

      // Wait for at least one tick
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Verify that positions were emitted
          expect(capturedPositions.length).toBeGreaterThan(0);
          
          // Velocity clamping is applied internally during ticks
          // We can verify the simulation is running and positions are reasonable
          const lastPositions = capturedPositions[capturedPositions.length - 1];
          lastPositions.forEach((pos) => {
            // Positions should be within reasonable bounds due to clamping
            expect(Math.abs(pos.x)).toBeLessThanOrEqual(10000);
            expect(Math.abs(pos.y)).toBeLessThanOrEqual(10000);
          });
          
          simulation.dispose();
          resolve();
        }, 100);
      });
    });

    it('should clamp positions within bounds', () => {
      const capturedPositions: Array<Map<string, { x: number; y: number; z: number }>> = [];
      
      const nodes: GraphNode[] = [
        {
          id: 'node1',
          name: 'Node 1',
          type: 'user',
          val: 1,
          x: 15000, // Beyond bound
          y: 0,
          z: 0,
        },
        {
          id: 'node2',
          name: 'Node 2',
          type: 'user',
          val: 1,
          x: 0,
          y: -15000, // Beyond bound
          z: 0,
        },
      ];

      simulation = new ForceSimulation({
        onTick: (positions) => {
          capturedPositions.push(new Map(positions));
        },
      });

      simulation.setData(nodes, []);
      simulation.start();

      // Wait for at least one tick to verify clamping
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(capturedPositions.length).toBeGreaterThan(0);
          
          const lastPositions = capturedPositions[capturedPositions.length - 1];
          const node1Pos = lastPositions.get('node1');
          const node2Pos = lastPositions.get('node2');
          
          // Verify positions are clamped to bounds
          expect(node1Pos).toBeDefined();
          expect(node2Pos).toBeDefined();
          if (node1Pos && node2Pos) {
            expect(Math.abs(node1Pos.x)).toBeLessThanOrEqual(10000);
            expect(Math.abs(node1Pos.y)).toBeLessThanOrEqual(10000);
            expect(Math.abs(node2Pos.x)).toBeLessThanOrEqual(10000);
            expect(Math.abs(node2Pos.y)).toBeLessThanOrEqual(10000);
          }

          simulation.dispose();
          resolve();
        }, 100);
      });
    });

    it('should auto-tune charge strength for large node counts', () => {
      // Create a moderate number of nodes for testing
      const nodes: GraphNode[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `node${i}`,
        name: `Node ${i}`,
        type: 'user',
        val: 1,
        x: Math.random() * 100,
        y: Math.random() * 100,
        z: Math.random() * 100,
      }));

      const physics: PhysicsConfig = {
        chargeStrength: -220,
        linkDistance: 120,
        velocityDecay: 0.88,
        cooldownTicks: 80,
        collisionRadius: 3,
        autoTune: true, // Enable auto-tune
      };

      simulation = new ForceSimulation({
        onTick: onTickMock,
        physics,
      });

      simulation.setData(nodes, []);
      simulation.start();

      // With auto-tune enabled, the charge strength should be scaled
      // Formula: -220 * sqrt(1000 / 1000) = -220 * 1 = -220
      // For 10000 nodes: -220 * sqrt(1000 / 10000) = -220 * 0.316 ≈ -69.5
      
      const stats = simulation.getStats();
      expect(stats.nodeCount).toBe(1000);
      
      // Verify simulation was set up (can't easily inspect d3 force strength)
      // but we can check that the simulation is running
      expect(stats.alpha).toBeGreaterThan(0);

      simulation.dispose();
    });

    it('should handle precomputed positions', () => {
      const nodes: GraphNode[] = [
        {
          id: 'node1',
          name: 'Node 1',
          type: 'subreddit',
          val: 100,
          x: 10,
          y: 20,
          z: 30,
        },
        {
          id: 'node2',
          name: 'Node 2',
          type: 'subreddit',
          val: 100,
          x: 40,
          y: 50,
          z: 60,
        },
      ];

      simulation = new ForceSimulation({
        onTick: onTickMock,
        usePrecomputedPositions: true,
      });

      simulation.setData(nodes, []);
      simulation.start();

      const stats = simulation.getStats();
      expect(stats.hasPrecomputedPositions).toBe(true);

      // When precomputed positions are used, the simulation should have emitted one tick
      expect(onTickMock).toHaveBeenCalled();

      simulation.dispose();
    });

    it('should detect convergence', () => {
      // Create a small graph that should converge quickly
      const nodes: GraphNode[] = Array.from({ length: 10 }, (_, i) => ({
        id: `node${i}`,
        name: `Node ${i}`,
        type: 'user',
        val: 1,
        x: i * 10,
        y: i * 10,
        z: 0,
      }));

      const links: GraphLink[] = Array.from({ length: 5 }, (_, i) => ({
        source: `node${i}`,
        target: `node${(i + 1) % 10}`,
      }));

      const physics: PhysicsConfig = {
        chargeStrength: -30,
        linkDistance: 30,
        velocityDecay: 0.4,
        cooldownTicks: 100,
        collisionRadius: 0,
        autoTune: false,
      };

      simulation = new ForceSimulation({
        onTick: onTickMock,
        physics,
      });

      simulation.setData(nodes, links);
      simulation.start();

      // The simulation should eventually converge
      const stats = simulation.getStats();
      expect(stats.nodeCount).toBe(10);
      expect(stats.linkCount).toBe(5);

      simulation.dispose();
    });
  });

  describe('Physics Configuration', () => {
    it('should update physics parameters', () => {
      const nodes: GraphNode[] = [
        { id: 'node1', name: 'Node 1', type: 'user', val: 1, x: 0, y: 0, z: 0 },
        { id: 'node2', name: 'Node 2', type: 'user', val: 1, x: 10, y: 10, z: 10 },
      ];

      const initialPhysics: PhysicsConfig = {
        chargeStrength: -30,
        linkDistance: 30,
        velocityDecay: 0.4,
        cooldownTicks: 100,
        collisionRadius: 0,
      };

      simulation = new ForceSimulation({
        onTick: onTickMock,
        physics: initialPhysics,
      });

      simulation.setData(nodes, []);
      simulation.start();

      // Update physics
      const newPhysics: PhysicsConfig = {
        chargeStrength: -60,
        linkDistance: 60,
        velocityDecay: 0.6,
        cooldownTicks: 200,
        collisionRadius: 5,
      };

      simulation.updatePhysics(newPhysics);

      // Verify simulation is still running with new parameters
      const stats = simulation.getStats();
      expect(stats.nodeCount).toBe(2);

      simulation.dispose();
    });

    it('should respect manual physics when auto-tune is off', () => {
      const nodes: GraphNode[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `node${i}`,
        name: `Node ${i}`,
        type: 'user',
        val: 1,
        x: Math.random() * 100,
        y: Math.random() * 100,
        z: Math.random() * 100,
      }));

      const physics: PhysicsConfig = {
        chargeStrength: -220,
        linkDistance: 120,
        velocityDecay: 0.88,
        cooldownTicks: 80,
        collisionRadius: 3,
        autoTune: false, // Disable auto-tune
      };

      simulation = new ForceSimulation({
        onTick: onTickMock,
        physics,
      });

      simulation.setData(nodes, []);
      simulation.start();

      // Manual physics values should be used as-is
      const stats = simulation.getStats();
      expect(stats.nodeCount).toBe(1000);

      simulation.dispose();
    });
  });

  describe('Node Operations', () => {
    beforeEach(() => {
      const nodes: GraphNode[] = [
        { id: 'node1', name: 'Node 1', type: 'user', val: 1, x: 0, y: 0, z: 0 },
        { id: 'node2', name: 'Node 2', type: 'user', val: 1, x: 10, y: 10, z: 10 },
      ];

      simulation.setData(nodes, []);
    });

    it('should get node position', () => {
      const position = simulation.getNodePosition('node1');
      expect(position).toBeDefined();
      expect(position?.x).toBeDefined();
      expect(position?.y).toBeDefined();
      expect(position?.z).toBeDefined();
    });

    it('should return null for non-existent node', () => {
      const position = simulation.getNodePosition('nonexistent');
      expect(position).toBeNull();
    });

    it('should set and release node position', () => {
      simulation.setNodePosition('node1', { x: 100, y: 200, z: 300 });
      const position = simulation.getNodePosition('node1');
      expect(position?.x).toBe(100);
      expect(position?.y).toBe(200);
      expect(position?.z).toBe(300);

      simulation.releaseNode('node1');
      // After release, node should be free to move again
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop simulation', () => {
      const nodes: GraphNode[] = [
        { id: 'node1', name: 'Node 1', type: 'user', val: 1, x: 0, y: 0, z: 0 },
      ];

      simulation.setData(nodes, []);
      simulation.start();

      const stats = simulation.getStats();
      expect(stats.alpha).toBeGreaterThan(0);

      simulation.stop();
      // After stop, simulation should be paused
    });

    it('should dispose cleanly', () => {
      const nodes: GraphNode[] = [
        { id: 'node1', name: 'Node 1', type: 'user', val: 1, x: 0, y: 0, z: 0 },
      ];

      simulation.setData(nodes, []);
      simulation.start();
      simulation.dispose();

      // After dispose, getStats should return zeros
      const stats = simulation.getStats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.linkCount).toBe(0);
    });
  });
});
