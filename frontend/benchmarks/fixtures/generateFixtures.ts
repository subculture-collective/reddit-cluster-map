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

function generateGraphData(config: FixtureConfig): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  
  // Node type distribution
  const subredditRatio = 0.1;
  const userRatio = 0.4;
  const postRatio = 0.3;
  const commentRatio = 0.2;
  
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
      val: Math.floor(Math.random() * 1000) + 100,
    });
  }
  
  // Generate users
  for (let i = 0; i < userCount; i++) {
    nodes.push({
      id: `user_${i}`,
      name: `user_${i}`,
      type: 'user',
      val: Math.floor(Math.random() * 200) + 10,
    });
  }
  
  // Generate posts
  for (let i = 0; i < postCount; i++) {
    nodes.push({
      id: `post_${i}`,
      name: `Post_${i}`,
      type: 'post',
      val: Math.floor(Math.random() * 100) + 5,
    });
  }
  
  // Generate comments
  for (let i = 0; i < commentCount; i++) {
    nodes.push({
      id: `comment_${i}`,
      name: `Comment_${i}`,
      type: 'comment',
      val: Math.floor(Math.random() * 50) + 1,
    });
  }
  
  // Generate links based on density
  const targetLinkCount = Math.floor(config.nodeCount * config.linkDensity);
  const usedPairs = new Set<string>();
  
  while (links.length < targetLinkCount && links.length < config.nodeCount * 10) {
    const sourceIdx = Math.floor(Math.random() * nodes.length);
    const targetIdx = Math.floor(Math.random() * nodes.length);
    
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
main();
