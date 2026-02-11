# Benchmark Suite - Example Output

## Running Benchmarks

```bash
$ npm run benchmark
```

### Output Example

```
> frontend@0.0.0 benchmark
> playwright test --config=playwright.benchmark.config.ts

Running 3 tests using 1 worker

🔬 Running benchmark for 1k fixture...
   Nodes: 1,000, Links: 2,500
   ✓ Data parsed in 70ms
   ✓ Initial render in 595ms
   ⏳ Waiting 5000ms for physics warmup...
   📊 Measuring FPS over 3000ms...
   ✓ Steady-state FPS: 48.7
   ✓ Memory usage: 26.8MB
   ✅ Benchmark complete (9134ms total)

🔬 Running benchmark for 10k fixture...
   Nodes: 10,000, Links: 25,000
   ✓ Data parsed in 395ms
   ✓ Initial render in 992ms
   ⏳ Waiting 5000ms for physics warmup...
   📊 Measuring FPS over 3000ms...
   ✓ Steady-state FPS: 9.7
   ✓ Memory usage: 72.3MB
   ✅ Benchmark complete (10000ms total)

🔬 Running benchmark for 50k fixture...
   Nodes: 50,000, Links: 125,000
   ✓ Data parsed in 3037ms
   ✓ Initial render in 3933ms
   ⏳ Waiting 5000ms for physics warmup...
   📊 Measuring FPS over 3000ms...
   ✓ Steady-state FPS: 2.2
   ✓ Memory usage: 445.4MB
   ✅ Benchmark complete (17963ms total)

📝 Results saved to: benchmarks/results/benchmark-2026-02-11T18-24-44-583Z.json
📝 Latest results saved to: benchmarks/results/benchmark-latest.json

  3 passed (37s)
```

## Comparing with Baseline

```bash
$ npm run benchmark:compare
```

### Success Output

```
> frontend@0.0.0 benchmark:compare
> npx tsx benchmarks/compare.ts

📊 Loading benchmark data...

   Baseline: benchmarks/results/baseline.json
   Current:  benchmarks/results/benchmark-latest.json

════════════════════════════════════════════════════════════════════════════════
BENCHMARK COMPARISON REPORT
════════════════════════════════════════════════════════════════════════════════

Baseline: 0.0.0 (2/11/2026, 6:24:44 PM)
Current:  0.0.0 (2/11/2026, 6:24:44 PM)

## Performance Comparison vs Baseline

| Fixture | FPS Change | Render Time Change | Memory Change | Status |
|---------|------------|-------------------|---------------|--------|
| 1k | ✅ +0.0% | ✅ +0.0% | ✅ +0.0% | ✅ PASS |
| 10k | ✅ +0.0% | ✅ +0.0% | ✅ +0.0% | ✅ PASS |
| 50k | ✅ +0.0% | ✅ +0.0% | ✅ +0.0% | ✅ PASS |


✅ All benchmarks passed! No regressions detected.

════════════════════════════════════════════════════════════════════════════════
✅ Build passed performance benchmarks
════════════════════════════════════════════════════════════════════════════════
```

### Regression Detected Output

```
📊 Loading benchmark data...

   Baseline: benchmarks/results/baseline.json
   Current:  benchmarks/results/benchmark-latest.json

════════════════════════════════════════════════════════════════════════════════
BENCHMARK COMPARISON REPORT
════════════════════════════════════════════════════════════════════════════════

Baseline: 0.0.0 (2/11/2026, 6:24:44 PM)
Current:  0.0.0 (2/11/2026, 6:30:15 PM)

## Performance Comparison vs Baseline

| Fixture | FPS Change | Render Time Change | Memory Change | Status |
|---------|------------|-------------------|---------------|--------|
| 1k | ✅ -2.3% | ✅ +5.1% | ✅ +3.2% | ✅ PASS |
| 10k | ⚠️ -12.8% | ⚠️ +25.3% | ⚠️ +15.7% | ❌ REGRESSION |
| 50k | ⚠️ -15.2% | ✅ +8.4% | ⚠️ +35.9% | ❌ REGRESSION |

**Regression details:**
- FPS dropped by 12.8% (9.7 → 8.5 FPS)
- Render time increased by 25.3% (992ms → 1243ms)
- Memory usage increased by 35.9% (445.4MB → 605.3MB)


❌ PERFORMANCE REGRESSIONS DETECTED!

🔴 10k:
   • FPS dropped by 12.8% (9.7 → 8.5 FPS)
   • Render time increased by 25.3% (992ms → 1243ms)

🔴 50k:
   • FPS dropped by 15.2% (2.2 → 1.9 FPS)
   • Memory usage increased by 35.9% (445.4MB → 605.3MB)

════════════════════════════════════════════════════════════════════════════════
⚠️  Build FAILED due to performance regressions
════════════════════════════════════════════════════════════════════════════════

(exit code 1)
```

## CI Integration

### GitHub Actions Workflow

When benchmarks run in CI, you'll see:

1. **Job Summary** with comparison table
2. **PR Comment** with benchmark results
3. **Artifacts** uploaded for historical analysis
4. **Status Check** that fails on regression

### Example PR Comment

```markdown
## 📊 Performance Benchmark Results

| Fixture | Nodes | Links | Render Time | Steady FPS | Parse Time | Memory |
|---------|-------|-------|-------------|------------|------------|--------|
| 1k | 1,000 | 2,500 | 595ms | 48.7 | 70ms | 26.8MB |
| 10k | 10,000 | 25,000 | 992ms | 9.7 | 395ms | 72.3MB |
| 50k | 50,000 | 125,000 | 3933ms | 2.2 | 3037ms | 445.4MB |

---
*Benchmarked at 2/11/2026, 6:24:44 PM*
```

## Result Files

### benchmark-latest.json

```json
{
  "version": "0.0.0",
  "timestamp": "2026-02-11T18:24:44.583Z",
  "results": [
    {
      "fixture": "1k",
      "metrics": {
        "renderTime": 590.8,
        "steadyStateFps": 48.7,
        "dataParseTime": 66,
        "physicsWarmupTime": 5002,
        "memoryUsage": 26.8,
        "peakMemoryUsage": 26.8,
        "nodeCount": 1000,
        "linkCount": 2500,
        "timestamp": "2026-02-11T18:21:08.131Z"
      },
      "metadata": {
        "browser": "chromium",
        "userAgent": "Mozilla/5.0 ...",
        "viewport": {
          "width": 1280,
          "height": 720
        }
      }
    },
    {
      "fixture": "10k",
      "metrics": {
        "renderTime": 992.1,
        "steadyStateFps": 9.7,
        "dataParseTime": 395,
        "physicsWarmupTime": 5001,
        "memoryUsage": 72.3,
        "peakMemoryUsage": 72.3,
        "nodeCount": 10000,
        "linkCount": 25000,
        "timestamp": "2026-02-11T18:21:18.605Z"
      },
      "metadata": {
        "browser": "chromium",
        "userAgent": "Mozilla/5.0 ...",
        "viewport": {
          "width": 1280,
          "height": 720
        }
      }
    },
    {
      "fixture": "50k",
      "metrics": {
        "renderTime": 3933.2,
        "steadyStateFps": 2.2,
        "dataParseTime": 3037,
        "physicsWarmupTime": 5002,
        "memoryUsage": 445.4,
        "peakMemoryUsage": 445.4,
        "nodeCount": 50000,
        "linkCount": 125000,
        "timestamp": "2026-02-11T18:21:36.398Z"
      },
      "metadata": {
        "browser": "chromium",
        "userAgent": "Mozilla/5.0 ...",
        "viewport": {
          "width": 1280,
          "height": 720
        }
      }
    }
  ]
}
```

## Key Metrics Interpretation

### Frame Rate (FPS)
- **>30 FPS**: Excellent - Smooth animation
- **20-30 FPS**: Good - Acceptable performance
- **10-20 FPS**: Fair - Noticeable lag
- **<10 FPS**: Poor - Significant performance issues

*Note: Headless CI environments typically show 30-50% lower FPS than hardware-accelerated browsers*

### Render Time
- **<500ms**: Excellent - Instant load
- **500-2000ms**: Good - Quick load
- **2000-5000ms**: Fair - Noticeable delay
- **>5000ms**: Poor - Long wait time

### Memory Usage
- **<50MB**: Excellent - Lightweight
- **50-200MB**: Good - Reasonable
- **200-500MB**: Fair - Heavy
- **>500MB**: High - May cause issues on low-end devices

## Performance Trends

Run `npm run benchmark` regularly and compare results:

```bash
# View historical results
ls -l benchmarks/results/

# Compare two specific runs
npm run benchmark:compare baseline.json benchmark-2026-02-11T18-24-44-583Z.json
```

Track metrics over time to identify:
- Performance improvements from optimizations
- Regressions from new features
- Bottlenecks as dataset size increases
