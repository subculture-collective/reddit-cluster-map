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
  cooldownTicks: number;
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
const nodeMap: Map<string, number> = new Map(); // id -> index in nodes array
let hasPrecomputedPositions = false;

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
  
  // Build node index map
  nodeMap.clear();
  nodes.forEach((node, idx) => {
    nodeMap.set(node.id, idx);
  });
  
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
 */
function sendPositions(): void {
  if (nodes.length === 0) return;
  
  // Create position buffer: 3 floats per node (x, y, z)
  const buffer = new Float32Array(nodes.length * 3);
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    buffer[i * 3] = node.x ?? 0;
    buffer[i * 3 + 1] = node.y ?? 0;
    buffer[i * 3 + 2] = node.z ?? 0;
  }
  
  const message: PositionsMessage = {
    type: 'positions',
    positions: buffer,
    alpha: simulation?.alpha() ?? 0,
    nodeCount: nodes.length,
  };
  
  // Transfer ownership of the buffer to avoid copying (use structured clone transfer)
  self.postMessage(message, { transfer: [buffer.buffer] });
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
