import type { GraphData } from "../types/graph";

export interface Community {
  id: number;
  nodes: string[];
  size: number;
  color: string;
  label?: string;
  topNodes?: Array<{ id: string; name: string; degree: number }>;
}

export interface CommunityResult {
  communities: Community[];
  nodeCommunities: Map<string, number>;
  modularity: number;
}

/**
 * Louvain community detection algorithm
 * Detects communities by optimizing modularity
 */
export function detectCommunities(data: GraphData): CommunityResult {
  const { nodes, links } = data;

  if (nodes.length === 0) {
    return {
      communities: [],
      nodeCommunities: new Map(),
      modularity: 0,
    };
  }

  // Build adjacency information
  const nodeIds = nodes.map((n) => n.id);
  const adjacency = new Map<string, Map<string, number>>();
  const degrees = new Map<string, number>();

  // Initialize
  for (const id of nodeIds) {
    adjacency.set(id, new Map());
    degrees.set(id, 0);
  }

  // Build weighted adjacency (count multi-edges as weight)
  let totalWeight = 0;
  for (const link of links) {
    const s = link.source;
    const t = link.target;
    if (!adjacency.has(s) || !adjacency.has(t)) continue;

    const weight = 1; // Could be link.weight if available
    adjacency.get(s)!.set(t, (adjacency.get(s)!.get(t) || 0) + weight);
    adjacency.get(t)!.set(s, (adjacency.get(t)!.get(s) || 0) + weight);
    degrees.set(s, (degrees.get(s) || 0) + weight);
    degrees.set(t, (degrees.get(t) || 0) + weight);
    totalWeight += weight;
  }

  // Initialize each node to its own community
  const nodeToCommunity = new Map<string, number>();
  nodeIds.forEach((id, i) => nodeToCommunity.set(id, i));

  let improved = true;
  let iteration = 0;
  const maxIterations = 50;

  // Louvain algorithm: iteratively move nodes to neighboring communities
  while (improved && iteration < maxIterations) {
    improved = false;
    iteration++;

    // Shuffle node order for better results
    const shuffledNodes = [...nodeIds].sort(() => Math.random() - 0.5);

    for (const nodeId of shuffledNodes) {
      const currentCommunity = nodeToCommunity.get(nodeId)!;
      const neighbors = adjacency.get(nodeId)!;

      // Find neighboring communities
      const neighborCommunities = new Set<number>();
      for (const [neighbor] of neighbors) {
        const nComm = nodeToCommunity.get(neighbor);
        if (nComm !== undefined) {
          neighborCommunities.add(nComm);
        }
      }

      let bestCommunity = currentCommunity;
      let bestGain = 0;

      // Try moving to each neighboring community
      for (const targetCommunity of neighborCommunities) {
        if (targetCommunity === currentCommunity) continue;

        const gain = modularityGain(
          nodeId,
          currentCommunity,
          targetCommunity,
          nodeToCommunity,
          adjacency,
          degrees,
          totalWeight
        );

        if (gain > bestGain) {
          bestGain = gain;
          bestCommunity = targetCommunity;
        }
      }

      // Move to best community if improvement found
      if (bestCommunity !== currentCommunity) {
        nodeToCommunity.set(nodeId, bestCommunity);
        improved = true;
      }
    }
  }

  // Renumber communities to be sequential
  const uniqueCommunities = Array.from(new Set(nodeToCommunity.values()));
  const communityMap = new Map(uniqueCommunities.map((id, i) => [id, i]));

  const finalNodeToCommunity = new Map<string, number>();
  for (const [node, comm] of nodeToCommunity) {
    finalNodeToCommunity.set(node, communityMap.get(comm)!);
  }

  // Build community information
  const communitySizes = new Map<number, string[]>();
  for (const [node, comm] of finalNodeToCommunity) {
    if (!communitySizes.has(comm)) {
      communitySizes.set(comm, []);
    }
    communitySizes.get(comm)!.push(node);
  }

  // Calculate degree for each node
  const nodeDegrees = new Map<string, number>();
  for (const link of links) {
    nodeDegrees.set(link.source, (nodeDegrees.get(link.source) || 0) + 1);
    nodeDegrees.set(link.target, (nodeDegrees.get(link.target) || 0) + 1);
  }

  // Generate colors for communities (using HSL for better distribution)
  const communities: Community[] = Array.from(communitySizes.entries())
    .map(([id, nodeIds]) => {
      const hue = (id * 137.5) % 360; // Golden angle for good distribution
      const color = `hsl(${hue}, 70%, 60%)`;

      // Find top nodes in community
      const topNodes = nodeIds
        .map((nid) => {
          const node = nodes.find((n) => n.id === nid);
          return {
            id: nid,
            name: node?.name || nid,
            degree: nodeDegrees.get(nid) || 0,
          };
        })
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 5);

      // Generate label from top node
      const label = topNodes[0]?.name || `Community ${id}`;

      return {
        id,
        nodes: nodeIds,
        size: nodeIds.length,
        color,
        label,
        topNodes,
      };
    })
    .sort((a, b) => b.size - a.size); // Sort by size descending

  // Calculate final modularity
  const modularity = calculateModularity(
    finalNodeToCommunity,
    adjacency,
    degrees,
    totalWeight
  );

  return {
    communities,
    nodeCommunities: finalNodeToCommunity,
    modularity,
  };
}

function modularityGain(
  nodeId: string,
  fromCommunity: number,
  toCommunity: number,
  nodeToCommunity: Map<string, number>,
  adjacency: Map<string, Map<string, number>>,
  degrees: Map<string, number>,
  totalWeight: number
): number {
  if (totalWeight === 0) return 0;

  const neighbors = adjacency.get(nodeId)!;
  const nodeDegree = degrees.get(nodeId) || 0;

  // Sum of weights to nodes in target community
  let weightTo = 0;
  // Sum of weights to nodes in current community
  let weightFrom = 0;

  for (const [neighbor, weight] of neighbors) {
    const nComm = nodeToCommunity.get(neighbor);
    if (nComm === toCommunity) {
      weightTo += weight;
    } else if (nComm === fromCommunity) {
      weightFrom += weight;
    }
  }

  const m2 = 2 * totalWeight;
  const gain =
    (weightTo - weightFrom) / m2 -
    (nodeDegree *
      (sumDegrees(toCommunity, nodeToCommunity, degrees) -
        sumDegrees(fromCommunity, nodeToCommunity, degrees))) /
      (m2 * m2);

  return gain;
}

function sumDegrees(
  community: number,
  nodeToCommunity: Map<string, number>,
  degrees: Map<string, number>
): number {
  let sum = 0;
  for (const [node, comm] of nodeToCommunity) {
    if (comm === community) {
      sum += degrees.get(node) || 0;
    }
  }
  return sum;
}

function calculateModularity(
  nodeToCommunity: Map<string, number>,
  adjacency: Map<string, Map<string, number>>,
  degrees: Map<string, number>,
  totalWeight: number
): number {
  if (totalWeight === 0) return 0;

  let modularity = 0;
  const m2 = 2 * totalWeight;

  for (const [node1, neighbors] of adjacency) {
    const comm1 = nodeToCommunity.get(node1);
    const deg1 = degrees.get(node1) || 0;

    for (const [node2, weight] of neighbors) {
      const comm2 = nodeToCommunity.get(node2);
      if (comm1 === comm2) {
        const deg2 = degrees.get(node2) || 0;
        modularity += weight - (deg1 * deg2) / m2;
      }
    }
  }

  return modularity / m2;
}

/**
 * Label propagation algorithm - faster alternative for large graphs
 */
export function detectCommunitiesLPA(data: GraphData): CommunityResult {
  const { nodes, links } = data;

  if (nodes.length === 0) {
    return {
      communities: [],
      nodeCommunities: new Map(),
      modularity: 0,
    };
  }

  const nodeIds = nodes.map((n) => n.id);
  const adjacency = new Map<string, Set<string>>();

  // Build adjacency list
  for (const id of nodeIds) {
    adjacency.set(id, new Set());
  }

  for (const link of links) {
    const s = link.source;
    const t = link.target;
    if (adjacency.has(s) && adjacency.has(t)) {
      adjacency.get(s)!.add(t);
      adjacency.get(t)!.add(s);
    }
  }

  // Initialize: each node has unique label
  const labels = new Map<string, number>();
  nodeIds.forEach((id, i) => labels.set(id, i));

  let changed = true;
  let iteration = 0;
  const maxIterations = 100;

  while (changed && iteration < maxIterations) {
    changed = false;
    iteration++;

    // Process nodes in random order
    const shuffled = [...nodeIds].sort(() => Math.random() - 0.5);

    for (const nodeId of shuffled) {
      const neighbors = adjacency.get(nodeId)!;
      if (neighbors.size === 0) continue;

      // Count label frequencies among neighbors
      const labelCounts = new Map<number, number>();
      for (const neighbor of neighbors) {
        const label = labels.get(neighbor)!;
        labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
      }

      // Find most frequent label
      let maxCount = 0;
      let bestLabel = labels.get(nodeId)!;
      for (const [label, count] of labelCounts) {
        if (count > maxCount) {
          maxCount = count;
          bestLabel = label;
        }
      }

      if (bestLabel !== labels.get(nodeId)) {
        labels.set(nodeId, bestLabel);
        changed = true;
      }
    }
  }

  // Convert to community structure (same format as Louvain)
  const uniqueLabels = Array.from(new Set(labels.values()));
  const labelMap = new Map(uniqueLabels.map((id, i) => [id, i]));

  const finalNodeToCommunity = new Map<string, number>();
  for (const [node, label] of labels) {
    finalNodeToCommunity.set(node, labelMap.get(label)!);
  }

  const communitySizes = new Map<number, string[]>();
  for (const [node, comm] of finalNodeToCommunity) {
    if (!communitySizes.has(comm)) {
      communitySizes.set(comm, []);
    }
    communitySizes.get(comm)!.push(node);
  }

  const nodeDegrees = new Map<string, number>();
  for (const link of links) {
    nodeDegrees.set(link.source, (nodeDegrees.get(link.source) || 0) + 1);
    nodeDegrees.set(link.target, (nodeDegrees.get(link.target) || 0) + 1);
  }

  const communities: Community[] = Array.from(communitySizes.entries())
    .map(([id, nodeIds]) => {
      const hue = (id * 137.5) % 360;
      const color = `hsl(${hue}, 70%, 60%)`;

      const topNodes = nodeIds
        .map((nid) => {
          const node = nodes.find((n) => n.id === nid);
          return {
            id: nid,
            name: node?.name || nid,
            degree: nodeDegrees.get(nid) || 0,
          };
        })
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 5);

      const label = topNodes[0]?.name || `Community ${id}`;

      return {
        id,
        nodes: nodeIds,
        size: nodeIds.length,
        color,
        label,
        topNodes,
      };
    })
    .sort((a, b) => b.size - a.size);

  return {
    communities,
    nodeCommunities: finalNodeToCommunity,
    modularity: 0, // LPA doesn't optimize modularity directly
  };
}

/**
 * Get color for a node based on its community
 */
export function getCommunityColor(
  nodeId: string,
  communities: CommunityResult
): string | undefined {
  const communityId = communities.nodeCommunities.get(nodeId);
  if (communityId === undefined) return undefined;

  const community = communities.communities.find((c) => c.id === communityId);
  return community?.color;
}
