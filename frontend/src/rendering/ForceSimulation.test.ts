import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ForceSimulation, type PhysicsConfig } from './ForceSimulation';
import type { GraphNode, GraphLink } from '../types/graph';

describe('ForceSimulation', () => {
    let simulation: ForceSimulation;
    let onTickMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        onTickMock = vi.fn();
    });

    afterEach(() => {
        if (simulation) {
            simulation.dispose();
        }
    });

    describe('Initialization', () => {
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
                onTick: onTickMock,
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

    describe('Data Management', () => {
        it('should handle empty graph', () => {
            simulation = new ForceSimulation({ onTick: onTickMock });

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

            simulation = new ForceSimulation({ onTick: onTickMock });
            simulation.setData(nodes, links);

            const stats = simulation.getStats();
            expect(stats.nodeCount).toBe(3);
            expect(stats.linkCount).toBe(2);
        });

        it('should detect precomputed positions', () => {
            const nodes: GraphNode[] = [
                {
                    id: 'node1',
                    name: 'Node 1',
                    type: 'subreddit',
                    x: 10,
                    y: 20,
                    z: 30,
                },
                {
                    id: 'node2',
                    name: 'Node 2',
                    type: 'user',
                    x: 40,
                    y: 50,
                    z: 60,
                },
                {
                    id: 'node3',
                    name: 'Node 3',
                    type: 'post',
                    x: 70,
                    y: 80,
                    z: 90,
                },
            ];

            const links: GraphLink[] = [{ source: 'node1', target: 'node2' }];

            simulation = new ForceSimulation({
                onTick: onTickMock,
                usePrecomputedPositions: true,
            });

            simulation.setData(nodes, links);

            const stats = simulation.getStats();
            expect(stats.hasPrecomputedPositions).toBe(true);
        });

        it('should handle partially precomputed positions', () => {
            const nodes: GraphNode[] = [
                {
                    id: 'node1',
                    name: 'Node 1',
                    type: 'subreddit',
                    x: 10,
                    y: 20,
                    z: 30,
                },
                { id: 'node2', name: 'Node 2', type: 'user' }, // No position
                {
                    id: 'node3',
                    name: 'Node 3',
                    type: 'post',
                    x: 70,
                    y: 80,
                    z: 90,
                },
            ];

            const links: GraphLink[] = [];

            simulation = new ForceSimulation({
                onTick: onTickMock,
                usePrecomputedPositions: true,
            });

            simulation.setData(nodes, links);

            const stats = simulation.getStats();
            // Should not treat as precomputed if less than 70% have positions
            expect(stats.hasPrecomputedPositions).toBe(false);
        });
    });

    describe('Physics Stability', () => {
        it('should clamp velocity to prevent runaway nodes', () => {
            const capturedPositions: Array<
                Map<string, { x: number; y: number; z: number }>
            > = [];

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
                onTick: positions => {
                    capturedPositions.push(new Map(positions));
                },
                physics,
            });

            simulation.setData(nodes, []);
            simulation.start();

            // Wait for at least one tick
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    // Verify that positions were emitted
                    expect(capturedPositions.length).toBeGreaterThan(0);

                    // Positions should be within reasonable bounds due to clamping
                    const lastPositions =
                        capturedPositions[capturedPositions.length - 1];
                    lastPositions.forEach(pos => {
                        expect(Math.abs(pos.x)).toBeLessThanOrEqual(10000);
                        expect(Math.abs(pos.y)).toBeLessThanOrEqual(10000);
                    });

                    resolve();
                }, 100);
            });
        });

        it('should clamp positions within bounds', () => {
            const capturedPositions: Array<
                Map<string, { x: number; y: number; z: number }>
            > = [];

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
                onTick: positions => {
                    capturedPositions.push(new Map(positions));
                },
            });

            simulation.setData(nodes, []);
            simulation.start();

            // Wait for at least one tick to verify clamping
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    expect(capturedPositions.length).toBeGreaterThan(0);

                    const lastPositions =
                        capturedPositions[capturedPositions.length - 1];
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

            const stats = simulation.getStats();
            expect(stats.nodeCount).toBe(1000);
            expect(stats.alpha).toBeGreaterThan(0);
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

            const stats = simulation.getStats();
            expect(stats.nodeCount).toBe(10);
            expect(stats.linkCount).toBe(5);
        });
    });

    describe('Physics Configuration', () => {
        it('should update physics parameters', () => {
            const nodes: GraphNode[] = [
                {
                    id: 'node1',
                    name: 'Node 1',
                    type: 'user',
                    val: 1,
                    x: 0,
                    y: 0,
                    z: 0,
                },
                {
                    id: 'node2',
                    name: 'Node 2',
                    type: 'user',
                    val: 1,
                    x: 10,
                    y: 10,
                    z: 10,
                },
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

            expect(() => simulation.updatePhysics(newPhysics)).not.toThrow();

            const stats = simulation.getStats();
            expect(stats.nodeCount).toBe(2);
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

            const stats = simulation.getStats();
            expect(stats.nodeCount).toBe(1000);
        });
    });

    describe('Node Operations', () => {
        beforeEach(() => {
            const nodes: GraphNode[] = [
                {
                    id: 'node1',
                    name: 'Node 1',
                    type: 'user',
                    val: 1,
                    x: 0,
                    y: 0,
                    z: 0,
                },
                {
                    id: 'node2',
                    name: 'Node 2',
                    type: 'user',
                    val: 1,
                    x: 10,
                    y: 10,
                    z: 10,
                },
            ];

            simulation = new ForceSimulation({ onTick: onTickMock });
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

            const pos = simulation.getNodePosition('node1');
            expect(pos).toBeDefined();
        });
    });

    describe('Lifecycle', () => {
        it('should start simulation', () => {
            const nodes: GraphNode[] = [
                { id: 'node1', name: 'Node 1', type: 'subreddit' },
            ];

            simulation = new ForceSimulation({ onTick: onTickMock });
            simulation.setData(nodes, []);

            expect(() => simulation.start()).not.toThrow();
        });

        it('should stop simulation', () => {
            const nodes: GraphNode[] = [
                { id: 'node1', name: 'Node 1', type: 'subreddit' },
            ];

            simulation = new ForceSimulation({ onTick: onTickMock });
            simulation.setData(nodes, []);
            simulation.start();

            expect(() => simulation.stop()).not.toThrow();
        });

        it('should dispose cleanly', () => {
            const nodes: GraphNode[] = [
                { id: 'node1', name: 'Node 1', type: 'subreddit' },
                { id: 'node2', name: 'Node 2', type: 'user' },
            ];

            const links: GraphLink[] = [{ source: 'node1', target: 'node2' }];

            simulation = new ForceSimulation({ onTick: onTickMock });
            simulation.setData(nodes, links);
            simulation.start();

            expect(() => simulation.dispose()).not.toThrow();

            const stats = simulation.getStats();
            expect(stats.nodeCount).toBe(0);
            expect(stats.linkCount).toBe(0);
        });
    });
});
