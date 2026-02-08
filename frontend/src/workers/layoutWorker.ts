/**
 * layoutWorker.ts - Web Worker for force-directed graph layout computation
 * 
 * Runs d3-force simulation off the main thread to prevent UI blocking.
 * Communicates with main thread via messages and transferable Float32Arrays.
 * 
 * Message Protocol:
 * - 'init': Initialize simulation with nodes and links
 * - 'updatePhysics': Update physics configuration
 * - 'stop': Stop simulation
 * - 'positions': (outgoing) Send position updates to main thread
 */

import * as d3 from 'd3-force';

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

interface PhysicsConfig {
  chargeStrength: number;
  linkDistance: number;
  velocityDecay: number;
  collisionRadius?: number;
}

interface InitMessage {
  type: 'init';
  nodes: Array<{
    id: string;
    x?: number;
    y?: number;
    z?: number;
    val?: number;
  }>;
  links: Array<{
    source: string;
    target: string;
  }>;
  physics: PhysicsConfig;
  usePrecomputedPositions: boolean;
}

interface UpdatePhysicsMessage {
  type: 'updatePhysics';
  physics: PhysicsConfig;
}

interface StopMessage {
  type: 'stop';
}

type WorkerMessage = InitMessage | UpdatePhysicsMessage | StopMessage;

interface PositionsMessage {
  type: 'positions';
  positions: Float32Array;
  alpha: number;
  nodeCount: number;
}

let simulation: d3.Simulation<SimNode, SimLink> | null = null;
let nodes: SimNode[] = [];
let links: SimLink[] = [];
let hasPrecomputedPositions = false;

// Reusable ping-pong buffers to avoid allocating a new Float32Array every tick
let positionBuffers: Float32Array[] = [];
let currentPositionBufferIndex = 0;

/**
 * Initialize simulation with graph data
 */
function initSimulation(message: InitMessage): void {
  // Stop existing simulation
  if (simulation) {
    simulation.stop();
  }
  
  hasPrecomputedPositions = message.usePrecomputedPositions;
  
  // Convert nodes
  nodes = message.nodes.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    z: node.z ?? 0,
    val: node.val,
  }));
  
  // Convert links
  links = message.links.map((link) => ({
    source: link.source,
    target: link.target,
  }));
  
  // Check if we have precomputed positions
  if (hasPrecomputedPositions && checkPrecomputedPositions()) {
    // Just send positions once and don't run simulation
    sendPositions();
    return;
  }
  
  // Create d3-force simulation
  simulation = d3.forceSimulation<SimNode, SimLink>(nodes);
  
  const physics = message.physics;
  
  // Configure forces
  simulation.force(
    'charge',
    d3.forceManyBody<SimNode>().strength(physics.chargeStrength)
  );
  
  simulation.force(
    'link',
    d3.forceLink<SimNode, SimLink>(links)
      .id((d: SimNode) => d.id)
      .distance(physics.linkDistance)
  );
  
  simulation.force('center', d3.forceCenter<SimNode>(0, 0));
  
  if (physics.collisionRadius && physics.collisionRadius > 0) {
    simulation.force(
      'collide',
      d3.forceCollide<SimNode>((node: SimNode) => {
        const val = node.val ?? 1;
        return Math.sqrt(val) + (physics.collisionRadius ?? 0);
      })
    );
  }
  
  simulation.velocityDecay(physics.velocityDecay);
  
  // Set up tick handler
  simulation.on('tick', () => {
    sendPositions();
  });
  
  simulation.alpha(1).restart();
}

/**
 * Check if majority of nodes have precomputed positions
 */
function checkPrecomputedPositions(): boolean {
  if (nodes.length === 0) return false;
  
  let withPositions = 0;
  for (const node of nodes) {
    if (
      typeof node.x === 'number' &&
      typeof node.y === 'number' &&
      typeof node.z === 'number'
    ) {
      withPositions++;
    }
  }
  
  return withPositions / nodes.length > 0.7;
}

/**
 * Update physics configuration
 */
function updatePhysics(message: UpdatePhysicsMessage): void {
  if (!simulation || hasPrecomputedPositions) return;
  
  const physics = message.physics;
  
  // Update charge force
  const charge = simulation.force<d3.ForceManyBody<SimNode>>('charge');
  if (charge) {
    charge.strength(physics.chargeStrength);
  }
  
  // Update link force
  const link = simulation.force<d3.ForceLink<SimNode, SimLink>>('link');
  if (link) {
    link.distance(physics.linkDistance);
  }
  
  // Update velocity decay
  simulation.velocityDecay(physics.velocityDecay);
  
  // Update collision force
  if (physics.collisionRadius && physics.collisionRadius > 0) {
    simulation.force(
      'collide',
      d3.forceCollide<SimNode>((node: SimNode) => {
        const val = node.val ?? 1;
        return Math.sqrt(val) + (physics.collisionRadius ?? 0);
      })
    );
  } else {
    simulation.force('collide', null);
  }
  
  // Reheat simulation to apply changes
  simulation.alpha(0.3).restart();
}

/**
 * Stop simulation
 */
function stopSimulation(): void {
  if (simulation) {
    simulation.stop();
  }
}

/**
 * Send current positions to main thread using transferable Float32Array
 * Format: [x1, y1, z1, x2, y2, z2, ...] with node IDs in same order as received
 * Uses ping-pong buffers to avoid allocating new arrays every tick
 */
function sendPositions(): void {
  if (nodes.length === 0) return;
  
  const requiredLength = nodes.length * 3; // 3 floats per node (x, y, z)
  
  // Initialize or resize ping-pong buffers when node count changes
  const needsInitOrResize =
    positionBuffers.length !== 2 ||
    positionBuffers[0].length !== requiredLength ||
    positionBuffers[1].length !== requiredLength;
  
  if (needsInitOrResize) {
    positionBuffers = [
      new Float32Array(requiredLength),
      new Float32Array(requiredLength),
    ];
    currentPositionBufferIndex = 0;
  }
  
  const buffer = positionBuffers[currentPositionBufferIndex];
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const baseIndex = i * 3;
    buffer[baseIndex] = node.x ?? 0;
    buffer[baseIndex + 1] = node.y ?? 0;
    buffer[baseIndex + 2] = node.z ?? 0;
  }
  
  const message: PositionsMessage = {
    type: 'positions',
    positions: buffer,
    alpha: simulation?.alpha() ?? 0,
    nodeCount: nodes.length,
  };
  
  // Transfer ownership of the buffer to avoid copying (use structured clone transfer)
  self.postMessage(message, { transfer: [buffer.buffer] });
  
  // Flip to the other buffer for the next tick
  currentPositionBufferIndex = currentPositionBufferIndex === 0 ? 1 : 0;
}

/**
 * Message handler
 */
self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  
  switch (message.type) {
    case 'init':
      initSimulation(message);
      break;
    case 'updatePhysics':
      updatePhysics(message);
      break;
    case 'stop':
      stopSimulation();
      break;
  }
});
