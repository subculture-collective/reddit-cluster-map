/**
 * Generate deterministic test fixtures for visual regression testing
 * Creates graph data with fixed positions for stable screenshots
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

const VISUAL_FIXTURE_CONFIGS: Record<string, FixtureConfig> = {
  'empty': { nodeCount: 0, linkDensity: 0 },
  'small': { nodeCount: 100, linkDensity: 2.5 },
  'large': { nodeCount: 10000, linkDensity: 2.5 },
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
  
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
}

interface GraphNodeWithPosition extends GraphNode {
  x?: number;
  y?: number;
  z?: number;
}

function generateGraphDataWithPositions(config: FixtureConfig, seed: number = 42): GraphData {
  const rng = new SeededRandom(seed);
  const nodes: GraphNodeWithPosition[] = [];
  const links: GraphLink[] = [];
  
  if (config.nodeCount === 0) {
    return { nodes, links };
  }
  
  // Node type distribution
  const subredditRatio = 0.1;
  const userRatio = 0.4;
  const postRatio = 0.3;
  
  const subredditCount = Math.floor(config.nodeCount * subredditRatio);
  const userCount = Math.floor(config.nodeCount * userRatio);
  const postCount = Math.floor(config.nodeCount * postRatio);
  const commentCount = config.nodeCount - subredditCount - userCount - postCount;
  
  // Layout parameters - spread nodes in 3D space deterministically
  const spread = Math.cbrt(config.nodeCount) * 100;
  
  // Generate subreddits (center cluster)
  for (let i = 0; i < subredditCount; i++) {
    nodes.push({
      id: `subreddit_${i}`,
      name: `Subreddit_${i}`,
      type: 'subreddit',
      val: rng.nextInt(100, 1100),
      x: rng.nextFloat(-spread * 0.5, spread * 0.5),
      y: rng.nextFloat(-spread * 0.5, spread * 0.5),
      z: rng.nextFloat(-spread * 0.5, spread * 0.5),
    });
  }
  
  // Generate users (distributed around)
  for (let i = 0; i < userCount; i++) {
    nodes.push({
      id: `user_${i}`,
      name: `user_${i}`,
      type: 'user',
      val: rng.nextInt(10, 210),
      x: rng.nextFloat(-spread, spread),
      y: rng.nextFloat(-spread, spread),
      z: rng.nextFloat(-spread, spread),
    });
  }
  
  // Generate posts
  for (let i = 0; i < postCount; i++) {
    nodes.push({
      id: `post_${i}`,
      name: `Post_${i}`,
      type: 'post',
      val: rng.nextInt(5, 105),
      x: rng.nextFloat(-spread * 0.8, spread * 0.8),
      y: rng.nextFloat(-spread * 0.8, spread * 0.8),
      z: rng.nextFloat(-spread * 0.8, spread * 0.8),
    });
  }
  
  // Generate comments
  for (let i = 0; i < commentCount; i++) {
    nodes.push({
      id: `comment_${i}`,
      name: `Comment_${i}`,
      type: 'comment',
      val: rng.nextInt(1, 51),
      x: rng.nextFloat(-spread * 0.9, spread * 0.9),
      y: rng.nextFloat(-spread * 0.9, spread * 0.9),
      z: rng.nextFloat(-spread * 0.9, spread * 0.9),
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
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  for (const [name, config] of Object.entries(VISUAL_FIXTURE_CONFIGS)) {
    console.log(`Generating ${name} visual fixture (${config.nodeCount} nodes)...`);
    const data = generateGraphDataWithPositions(config);
    
    const outputPath = path.join(outputDir, `visual-${name}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    
    console.log(`  Created ${outputPath}`);
    console.log(`  Nodes: ${data.nodes.length}, Links: ${data.links.length}`);
  }
  
  console.log('Visual fixture generation complete!');
}

export { generateGraphDataWithPositions, VISUAL_FIXTURE_CONFIGS };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
