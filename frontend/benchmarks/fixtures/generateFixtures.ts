/**
 * Generate standardized test fixtures for benchmarking
 * Creates graph data with varying node counts for performance testing
 */

import type { GraphNode, GraphLink, GraphData } from '../../src/types/graph';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface FixtureConfig {
  nodeCount: number;
  linkDensity: number; // Average links per node
}

const FIXTURE_CONFIGS: Record<string, FixtureConfig> = {
  '1k': { nodeCount: 1000, linkDensity: 2.5 },
  '10k': { nodeCount: 10000, linkDensity: 2.5 },
  '50k': { nodeCount: 50000, linkDensity: 2.5 },
  '100k': { nodeCount: 100000, linkDensity: 2.5 },
};

// Seeded random number generator for deterministic fixtures
class SeededRandom {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed;
  }
  
  next(): number {
    // Linear congruential generator
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
  
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }
}

function generateGraphData(config: FixtureConfig, seed: number = 12345): GraphData {
  const rng = new SeededRandom(seed);
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  
  // Node type distribution
  const subredditRatio = 0.1;
  const userRatio = 0.4;
  const postRatio = 0.3;
  
  const subredditCount = Math.floor(config.nodeCount * subredditRatio);
  const userCount = Math.floor(config.nodeCount * userRatio);
  const postCount = Math.floor(config.nodeCount * postRatio);
  const commentCount = config.nodeCount - subredditCount - userCount - postCount;
  
  // Generate subreddits
  for (let i = 0; i < subredditCount; i++) {
    nodes.push({
      id: `subreddit_${i}`,
      name: `Subreddit_${i}`,
      type: 'subreddit',
      val: rng.nextInt(100, 1100),
    });
  }
  
  // Generate users
  for (let i = 0; i < userCount; i++) {
    nodes.push({
      id: `user_${i}`,
      name: `user_${i}`,
      type: 'user',
      val: rng.nextInt(10, 210),
    });
  }
  
  // Generate posts
  for (let i = 0; i < postCount; i++) {
    nodes.push({
      id: `post_${i}`,
      name: `Post_${i}`,
      type: 'post',
      val: rng.nextInt(5, 105),
    });
  }
  
  // Generate comments
  for (let i = 0; i < commentCount; i++) {
    nodes.push({
      id: `comment_${i}`,
      name: `Comment_${i}`,
      type: 'comment',
      val: rng.nextInt(1, 51),
    });
  }
  
  // Generate links based on density (deterministic)
  const targetLinkCount = Math.floor(config.nodeCount * config.linkDensity);
  const usedPairs = new Set<string>();
  
  // Use deterministic pairing for stable graph structure
  let attempts = 0;
  const maxAttempts = targetLinkCount * 10;
  
  while (links.length < targetLinkCount && attempts < maxAttempts) {
    const sourceIdx = rng.nextInt(0, nodes.length);
    const targetIdx = rng.nextInt(0, nodes.length);
    attempts++;
    
    if (sourceIdx === targetIdx) continue;
    
    const source = nodes[sourceIdx].id;
    const target = nodes[targetIdx].id;
    const pairKey = `${source}-${target}`;
    
    if (!usedPairs.has(pairKey)) {
      links.push({ source, target });
      usedPairs.add(pairKey);
    }
  }
  
  return { nodes, links };
}

function main() {
  const outputDir = path.join(__dirname);
  
  for (const [name, config] of Object.entries(FIXTURE_CONFIGS)) {
    console.log(`Generating ${name} fixture (${config.nodeCount} nodes)...`);
    const data = generateGraphData(config);
    
    const outputPath = path.join(outputDir, `graph-${name}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    
    console.log(`  Created ${outputPath}`);
    console.log(`  Nodes: ${data.nodes.length}, Links: ${data.links.length}`);
  }
  
  console.log('Fixture generation complete!');
}

export { generateGraphData, FIXTURE_CONFIGS };

// Run if executed directly (ESM compatible)
// Check if this module is being run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
