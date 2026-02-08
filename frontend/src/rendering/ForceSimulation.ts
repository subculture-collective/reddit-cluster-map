import * as d3 from 'd3';
import type { GraphNode, GraphLink } from '../types/graph';

/**
 * ForceSimulation - Manages d3-force layout simulation for node positions
 * 
 * Wraps d3-force simulation to work with our custom InstancedNodeRenderer.
 * Handles both dynamic simulation and precomputed positions from backend.
 * 
 * Features:
 * - Integration with d3-force physics engine
 * - Support for precomputed positions (skips simulation)
 * - Position update callbacks for renderer synchronization
 * - Configurable physics parameters
 * - Efficient tick handling
 * 
 * @example
 * ```typescript
 * const simulation = new ForceSimulation({
 *   onTick: (positions) => renderer.updatePositions(positions),
 *   physics: { chargeStrength: -30, linkDistance: 30 }
 * });
 * 
 * simulation.setData(nodes, links);
 * simulation.start();
 * ```
 */

export interface PhysicsConfig {
  chargeStrength: number;
  linkDistance: number;
  velocityDecay: number;
  cooldownTicks: number;
  collisionRadius?: number;
  autoTune?: boolean; // Auto-scale physics parameters based on node count
}

export interface ForceSimulationConfig {
  onTick?: (positions: Map<string, { x: number; y: number; z: number }>) => void;
  physics?: PhysicsConfig;
  usePrecomputedPositions?: boolean;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  val?: number;
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

export class ForceSimulation {
  private simulation: d3.Simulation<SimNode, SimLink> | null = null;
  private nodes: SimNode[] = [];
  private links: SimLink[] = [];
  private config: ForceSimulationConfig;
  private nodeMap: Map<string, SimNode> = new Map();
  private hasPrecomputedPositions = false;
  
  // Physics stability constants
  private static readonly MAX_VELOCITY = 50;
  private static readonly POSITION_BOUND = 10000;
  private static readonly CONVERGENCE_THRESHOLD = 0.1;

  constructor(config: ForceSimulationConfig = {}) {
    this.config = config;
  }

  /**
   * Calculate auto-tuned charge strength based on node count
   * Formula: charge = baseCharge * sqrt(1000 / nodeCount)
   * This scales repulsion down as node count increases
   */
  private getAutoTunedChargeStrength(nodeCount: number, baseCharge: number): number {
    if (nodeCount <= 1) return baseCharge;
    return baseCharge * Math.sqrt(1000 / nodeCount);
  }

  /**
   * Calculate auto-tuned cooldown ticks based on node count
   * Formula: max(200, nodeCount / 100)
   * Ensures larger graphs get more time to stabilize
   */
  private getAutoTunedCooldownTicks(nodeCount: number): number {
    return Math.max(200, Math.floor(nodeCount / 100));
  }

  /**
   * Clamp velocity to prevent runaway nodes
   */
  private clampVelocity(node: SimNode): void {
    if (node.vx !== undefined && node.vy !== undefined) {
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed > ForceSimulation.MAX_VELOCITY) {
        const scale = ForceSimulation.MAX_VELOCITY / speed;
        node.vx *= scale;
        node.vy *= scale;
        // Also clamp z velocity if present
        if (node.vz !== undefined) {
          node.vz *= scale;
        }
      }
    }
  }

  /**
   * Clamp position to prevent nodes from drifting to infinity
   */
  private clampPosition(node: SimNode): void {
    if (node.x !== undefined) {
      node.x = Math.max(-ForceSimulation.POSITION_BOUND, Math.min(ForceSimulation.POSITION_BOUND, node.x));
    }
    if (node.y !== undefined) {
      node.y = Math.max(-ForceSimulation.POSITION_BOUND, Math.min(ForceSimulation.POSITION_BOUND, node.y));
    }
    if (node.z !== undefined) {
      node.z = Math.max(-ForceSimulation.POSITION_BOUND, Math.min(ForceSimulation.POSITION_BOUND, node.z));
    }
  }

  /**
   * Apply clamping and check convergence in a single pass for efficiency
   * Returns the maximum velocity found across all nodes
   */
  private clampAndCheckConvergence(): number {
    let maxVelocity = 0;
    for (const node of this.nodes) {
      // Clamp velocity
      if (node.vx !== undefined && node.vy !== undefined) {
        const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
        if (speed > ForceSimulation.MAX_VELOCITY) {
          const scale = ForceSimulation.MAX_VELOCITY / speed;
          node.vx *= scale;
          node.vy *= scale;
          if (node.vz !== undefined) {
            node.vz *= scale;
          }
        }
        maxVelocity = Math.max(maxVelocity, speed);
      }
      
      // Clamp position
      if (node.x !== undefined) {
        node.x = Math.max(-ForceSimulation.POSITION_BOUND, Math.min(ForceSimulation.POSITION_BOUND, node.x));
      }
      if (node.y !== undefined) {
        node.y = Math.max(-ForceSimulation.POSITION_BOUND, Math.min(ForceSimulation.POSITION_BOUND, node.y));
      }
      if (node.z !== undefined) {
        node.z = Math.max(-ForceSimulation.POSITION_BOUND, Math.min(ForceSimulation.POSITION_BOUND, node.z));
      }
    }
    return maxVelocity;
  }

  /**
   * Set graph data and initialize simulation
   */
  public setData(nodes: GraphNode[], links: GraphLink[]): void {
    // Convert nodes to simulation nodes
    this.nodes = nodes.map(node => ({
      id: node.id,
      x: node.x,
      y: node.y,
      z: node.z,
      val: node.val,
    }));

    // Build node map for quick lookup
    this.nodeMap.clear();
    for (const node of this.nodes) {
      this.nodeMap.set(node.id, node);
    }

    // Convert links
    this.links = links.map(link => ({
      source: link.source,
      target: link.target,
    }));

    // Check if we have precomputed positions
    if (this.config.usePrecomputedPositions) {
      this.hasPrecomputedPositions = this.checkPrecomputedPositions();
    } else {
      this.hasPrecomputedPositions = false;
    }

    // Initialize or update simulation
    this.initializeSimulation();
  }

  /**
   * Check if majority of nodes have precomputed positions
   */
  private checkPrecomputedPositions(): boolean {
    if (this.nodes.length === 0) return false;
    
    let withPositions = 0;
    for (const node of this.nodes) {
      if (
        typeof node.x === 'number' &&
        typeof node.y === 'number' &&
        typeof node.z === 'number'
      ) {
        withPositions++;
      }
    }
    
    return withPositions / this.nodes.length > 0.7;
  }

  /**
   * Initialize or reinitialize the d3-force simulation
   * Note: Uses 2D d3-force (updates x/y only). Z coordinates are preserved from initial positions
   * but not updated by simulation. For true 3D layouts, consider d3-force-3d or ngraph.
   */
  private initializeSimulation(): void {
    // Stop existing simulation
    if (this.simulation) {
      this.simulation.stop();
    }

    // Create new simulation with 2D forces (x/y only, z preserved from initial positions)
    this.simulation = d3.forceSimulation<SimNode, SimLink>(this.nodes);

    // If we have precomputed positions, skip simulation
    if (this.hasPrecomputedPositions) {
      // Clamp precomputed positions to bounds
      for (const node of this.nodes) {
        this.clampPosition(node);
      }
      
      // Set cooldown to 0 to stop immediately
      this.simulation
        .force('charge', null)
        .force('link', null)
        .force('center', null)
        .alphaDecay(1) // Stop immediately
        .velocityDecay(1); // Stop immediately
      
      // Still emit one tick with the precomputed positions
      this.emitTick();
      return;
    }

    // Configure forces based on physics config
    const physics = this.config.physics;
    const nodeCount = this.nodes.length;
    const autoTune = physics?.autoTune ?? false;
    
    // Charge force (repulsion) - auto-tune if enabled
    let chargeStrength = physics?.chargeStrength ?? -30;
    if (autoTune && nodeCount > 0) {
      chargeStrength = this.getAutoTunedChargeStrength(nodeCount, chargeStrength);
    }
    this.simulation.force(
      'charge',
      d3.forceManyBody<SimNode>()
        .strength(chargeStrength)
    );

    // Link force
    const linkDistance = physics?.linkDistance ?? 30;
    this.simulation.force(
      'link',
      d3.forceLink<SimNode, SimLink>(this.links)
        .id((d: SimNode) => d.id)
        .distance(linkDistance)
    );

    // Center force
    this.simulation.force(
      'center',
      d3.forceCenter<SimNode>(0, 0)
    );

    // Collision force (if configured)
    if (physics?.collisionRadius && physics.collisionRadius > 0) {
      this.simulation.force(
        'collide',
        d3.forceCollide<SimNode>((node: SimNode) => {
          const val = node.val ?? 1;
          return Math.sqrt(val) + (physics.collisionRadius ?? 0);
        })
      );
    }

    // Velocity decay (damping)
    const velocityDecay = physics?.velocityDecay ?? 0.4;
    this.simulation.velocityDecay(velocityDecay);

    // Set up tick handler with clamping and convergence detection
    this.simulation.on('tick', () => {
      // Apply velocity and position clamping, and check convergence in single pass
      const maxVelocity = this.clampAndCheckConvergence();
      
      // Stop simulation if converged
      if (maxVelocity < ForceSimulation.CONVERGENCE_THRESHOLD && this.simulation) {
        this.simulation.alpha(0);
      }
      
      this.emitTick();
    });

    // Configure alpha decay / cooldown behavior
    const manualCooldownTicks = physics?.cooldownTicks;
    let cooldownTicks: number | undefined;

    if (autoTune && nodeCount > 0) {
      // Auto-tune mode: derive cooldown from node count
      cooldownTicks = this.getAutoTunedCooldownTicks(nodeCount);
    } else if (typeof manualCooldownTicks === 'number') {
      if (manualCooldownTicks > 0) {
        // Manual mode: use configured cooldownTicks directly
        cooldownTicks = manualCooldownTicks;
      } else {
        // Edge case: cooldownTicks <= 0 disables automatic cooling
        // alphaDecay(0) means no decay; convergence detection will still stop the sim
        this.simulation.alphaDecay(0);
      }
    }

    if (cooldownTicks && cooldownTicks > 0) {
      // Alpha decay formula: 1 - Math.pow(0.001, 1 / cooldownTicks)
      // This makes alpha reach ~0.001 after 'cooldownTicks' iterations
      const alphaDecay = 1 - Math.pow(0.001, 1 / cooldownTicks);
      this.simulation.alphaDecay(alphaDecay);
    }

    // Note: Removed synchronous tick() to avoid blocking the main thread.
    // The simulation will run incrementally via the animation loop.
  }

  /**
   * Emit current positions to callback
   */
  private emitTick(): void {
    if (!this.config.onTick) return;

    const positions = new Map<string, { x: number; y: number; z: number }>();
    
    for (const node of this.nodes) {
      positions.set(node.id, {
        x: node.x ?? 0,
        y: node.y ?? 0,
        z: node.z ?? 0,
      });
    }

    this.config.onTick(positions);
  }

  /**
   * Start the simulation
   */
  public start(): void {
    if (this.simulation && !this.hasPrecomputedPositions) {
      this.simulation.alpha(1).restart();
    }
  }

  /**
   * Stop the simulation
   */
  public stop(): void {
    if (this.simulation) {
      this.simulation.stop();
    }
  }

  /**
   * Update physics configuration
   */
  public updatePhysics(physics: PhysicsConfig): void {
    this.config.physics = physics;
    
    if (!this.simulation || this.hasPrecomputedPositions) return;

    const nodeCount = this.nodes.length;
    const autoTune = physics.autoTune ?? false;

    // Update charge force - apply auto-tuning if enabled
    let chargeStrength = physics.chargeStrength;
    if (autoTune && nodeCount > 0) {
      chargeStrength = this.getAutoTunedChargeStrength(nodeCount, chargeStrength);
    }
    
    const charge = this.simulation.force<d3.ForceManyBody<SimNode>>('charge');
    if (charge) {
      charge.strength(chargeStrength);
    }

    // Update link force
    const link = this.simulation.force<d3.ForceLink<SimNode, SimLink>>('link');
    if (link) {
      link.distance(physics.linkDistance);
    }

    // Update velocity decay
    this.simulation.velocityDecay(physics.velocityDecay);

    // Update collision force
    if (physics.collisionRadius && physics.collisionRadius > 0) {
      this.simulation.force(
        'collide',
        d3.forceCollide<SimNode>((node: SimNode) => {
          const val = node.val ?? 1;
          return Math.sqrt(val) + (physics.collisionRadius ?? 0);
        })
      );
    } else {
      this.simulation.force('collide', null);
    }

    // Update alpha decay / cooldown behavior
    const manualCooldownTicks = physics.cooldownTicks;
    let cooldownTicks: number | undefined;

    if (autoTune && nodeCount > 0) {
      // Auto-tune mode: derive cooldown from node count
      cooldownTicks = this.getAutoTunedCooldownTicks(nodeCount);
    } else if (typeof manualCooldownTicks === 'number') {
      if (manualCooldownTicks > 0) {
        // Manual mode: use configured cooldownTicks directly
        cooldownTicks = manualCooldownTicks;
      } else {
        // Edge case: cooldownTicks <= 0 disables automatic cooling
        this.simulation.alphaDecay(0);
      }
    }

    if (cooldownTicks && cooldownTicks > 0) {
      const alphaDecay = 1 - Math.pow(0.001, 1 / cooldownTicks);
      this.simulation.alphaDecay(alphaDecay);
    }

    // Restart simulation to apply changes
    this.simulation.alpha(0.3).restart();
  }

  /**
   * Get current node position
   */
  public getNodePosition(nodeId: string): { x: number; y: number; z: number } | null {
    const node = this.nodeMap.get(nodeId);
    if (!node) return null;

    return {
      x: node.x ?? 0,
      y: node.y ?? 0,
      z: node.z ?? 0,
    };
  }

  /**
   * Manually set a node's position (e.g., for camera focus)
   */
  public setNodePosition(nodeId: string, position: { x: number; y: number; z: number }): void {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    node.x = position.x;
    node.y = position.y;
    node.z = position.z;
    node.fx = position.x;
    node.fy = position.y;
    node.fz = position.z;
  }

  /**
   * Release fixed position for a node
   */
  public releaseNode(nodeId: string): void {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    node.fx = null;
    node.fy = null;
    node.fz = null;
  }

  /**
   * Get simulation statistics
   */
  public getStats(): {
    nodeCount: number;
    linkCount: number;
    alpha: number;
    hasPrecomputedPositions: boolean;
  } {
    return {
      nodeCount: this.nodes.length,
      linkCount: this.links.length,
      alpha: this.simulation?.alpha() ?? 0,
      hasPrecomputedPositions: this.hasPrecomputedPositions,
    };
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.simulation) {
      this.simulation.stop();
      this.simulation = null;
    }
    this.nodes = [];
    this.links = [];
    this.nodeMap.clear();
  }
}
