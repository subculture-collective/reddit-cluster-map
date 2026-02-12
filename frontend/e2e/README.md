# End-to-End Tests

This directory contains Playwright-based end-to-end tests for the Reddit Cluster Map frontend.

## Test Types

### Smoke Tests (`smoke.spec.ts`)
Basic tests to ensure the application loads and renders without crashing:
- Homepage loads successfully
- Main UI elements render
- Navigation works

### Visual Regression Tests (`visual.spec.ts`)
Screenshot-based tests to catch unintended visual changes in graph rendering:
- 11 test scenarios covering different view modes, themes, and graph sizes
- Deterministic fixtures with fixed positions for stable screenshots
- 1% pixel diff tolerance for minor rendering variations

## Directory Structure

```
e2e/
├── smoke.spec.ts                # Smoke tests
├── visual.spec.ts               # Visual regression tests
├── fixtures/                    # Test data fixtures
│   ├── generateVisualFixtures.ts  # Fixture generator script
│   ├── visual-empty.json          # Empty graph (0 nodes)
│   ├── visual-small.json          # Small graph (100 nodes)
│   └── visual-large.json          # Large graph (10k nodes)
└── visual.spec.ts-snapshots/    # Baseline screenshots
    ├── empty-light-3d-chromium-linux.png
    ├── empty-dark-3d-chromium-linux.png
    ├── small-light-3d-chromium-linux.png
    ├── small-dark-3d-chromium-linux.png
    ├── small-light-2d-chromium-linux.png
    ├── small-dark-2d-chromium-linux.png
    ├── small-light-3d-zoomed-chromium-linux.png
    ├── small-light-dashboard-chromium-linux.png
    ├── small-dark-dashboard-chromium-linux.png
    ├── large-light-3d-chromium-linux.png
    └── large-dark-3d-chromium-linux.png
```

## Running Tests

```bash
# Run all e2e tests
npm run test:e2e

# Run only visual regression tests
npm run test:visual

# Update visual regression baselines
npm run test:visual:update

# Run tests in UI mode (interactive debugging)
npm run test:visual:ui
```

## Test Fixtures

Visual test fixtures include deterministic graph data with fixed node positions. To regenerate:

```bash
npx tsx e2e/fixtures/generateVisualFixtures.ts
```

This creates three fixture files:
- **empty** (0 nodes) - Tests empty state UI
- **small** (100 nodes) - Fast tests for common scenarios
- **large** (10,000 nodes) - Stress tests for rendering performance

## Baseline Screenshots

Baseline screenshots are stored in `visual.spec.ts-snapshots/` and committed to the repository. They serve as the reference for visual regression tests.

### When to Update Baselines

Update baselines when you make **intentional** visual changes:
1. New features that change graph appearance
2. Design updates or theme changes
3. Layout modifications

**DO NOT** update baselines to "fix" failing tests without understanding why they failed.

### How to Update Baselines

1. Make your code changes
2. Run `npm run test:visual` to see failures
3. Review the diff report: `open playwright-report/index.html`
4. If changes are correct, run: `npm run test:visual:update`
5. Commit the updated baseline screenshots

## CI Integration

Visual regression tests run automatically on every pull request:
- Separate CI job after unit tests
- On failure, diff reports are uploaded as artifacts
- Artifacts retained for 30 days for investigation

## Configuration

Test configuration is in `playwright.config.ts`:
- Fixed viewport: 1280x720
- Animations disabled for stability
- 1% pixel diff tolerance
- Consistent browser flags for stable rendering

See `../TESTING.md` for detailed documentation.
