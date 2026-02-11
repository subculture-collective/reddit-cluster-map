#!/usr/bin/env node
/**
 * Compare benchmark results against baseline and detect regressions
 * 
 * Usage:
 *   npx tsx benchmarks/compare.ts [baseline.json] [current.json]
 *   
 * If no arguments provided, compares benchmark-latest.json against baseline.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { 
  compareWithBaseline, 
  formatResultsAsMarkdown, 
  formatComparisonAsMarkdown,
  type BaselineData,
} from './utils/metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FPS_REGRESSION_THRESHOLD = 10; // Percent

function main() {
  const args = process.argv.slice(2);
  const resultsDir = path.join(__dirname, 'results');
  
  // Determine file paths
  let baselinePath: string;
  let currentPath: string;
  
  if (args.length === 0) {
    baselinePath = path.join(resultsDir, 'baseline.json');
    currentPath = path.join(resultsDir, 'benchmark-latest.json');
  } else if (args.length === 2) {
    baselinePath = path.resolve(args[0]);
    currentPath = path.resolve(args[1]);
  } else {
    console.error('Usage: npx tsx benchmarks/compare.ts [baseline.json] [current.json]');
    process.exit(1);
  }
  
  // Check if files exist
  if (!fs.existsSync(baselinePath)) {
    console.error(`❌ Baseline file not found: ${baselinePath}`);
    console.error('\nTo create a baseline, run:');
    console.error('  npm run benchmark');
    console.error('  cp benchmarks/results/benchmark-latest.json benchmarks/results/baseline.json');
    process.exit(1);
  }
  
  if (!fs.existsSync(currentPath)) {
    console.error(`❌ Current results file not found: ${currentPath}`);
    process.exit(1);
  }
  
  // Load data
  console.log('📊 Loading benchmark data...\n');
  console.log(`   Baseline: ${baselinePath}`);
  console.log(`   Current:  ${currentPath}\n`);
  
  const baseline: BaselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  const current: BaselineData = JSON.parse(fs.readFileSync(currentPath, 'utf-8'));
  
  // Compare results
  const comparisons = compareWithBaseline(current.results, baseline, FPS_REGRESSION_THRESHOLD);
  
  // Generate report
  console.log('═'.repeat(80));
  console.log('BENCHMARK COMPARISON REPORT');
  console.log('═'.repeat(80));
  console.log(`\nBaseline: ${baseline.version} (${new Date(baseline.timestamp).toLocaleString()})`);
  console.log(`Current:  ${current.version} (${new Date(current.timestamp).toLocaleString()})\n`);
  
  // Print comparison table
  console.log(formatComparisonAsMarkdown(comparisons));
  
  // Check for regressions
  const regressions = comparisons.filter(c => c.isRegression);
  
  if (regressions.length > 0) {
    console.log('\n❌ PERFORMANCE REGRESSIONS DETECTED!\n');
    
    for (const regression of regressions) {
      console.log(`🔴 ${regression.fixture}:`);
      if (regression.regressionDetails) {
        for (const detail of regression.regressionDetails) {
          console.log(`   • ${detail}`);
        }
      }
      console.log('');
    }
    
    console.log('═'.repeat(80));
    console.log('⚠️  Build FAILED due to performance regressions');
    console.log('═'.repeat(80));
    
    // Write markdown summary for GitHub Actions
    if (process.env.GITHUB_STEP_SUMMARY) {
      const summaryPath = process.env.GITHUB_STEP_SUMMARY;
      let summary = '# ❌ Performance Benchmark Results - REGRESSION DETECTED\n\n';
      summary += formatComparisonAsMarkdown(comparisons);
      summary += '\n\n## Current Results\n\n';
      summary += formatResultsAsMarkdown(current.results);
      
      fs.appendFileSync(summaryPath, summary);
    }
    
    process.exit(1);
  } else {
    console.log('\n✅ All benchmarks passed! No regressions detected.\n');
    
    // Write markdown summary for GitHub Actions
    if (process.env.GITHUB_STEP_SUMMARY) {
      const summaryPath = process.env.GITHUB_STEP_SUMMARY;
      let summary = '# ✅ Performance Benchmark Results - PASSED\n\n';
      summary += formatComparisonAsMarkdown(comparisons);
      summary += '\n\n## Current Results\n\n';
      summary += formatResultsAsMarkdown(current.results);
      
      fs.appendFileSync(summaryPath, summary);
    }
    
    console.log('═'.repeat(80));
    console.log('✅ Build passed performance benchmarks');
    console.log('═'.repeat(80));
    
    process.exit(0);
  }
}

// Run main
main();
