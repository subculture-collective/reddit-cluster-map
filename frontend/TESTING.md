# Frontend Testing Guide

## Overview

The frontend test suite uses Vitest and React Testing Library to ensure code quality and prevent regressions. We aim for **≥75% test coverage** for core components.

## Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run tests with coverage report
npm run test:coverage

# Run tests with UI
npm run test:ui

# Run visual regression tests
npm run test:visual

# Update visual regression baselines
npm run test:visual:update
```

## Coverage Requirements

We maintain coverage thresholds to ensure code quality:

- **Lines**: ≥75%
- **Statements**: ≥75%
- **Branches**: ≥70%
- **Functions**: ≥60%

Coverage reports are generated in the `coverage/` directory and can be viewed in your browser:

```bash
npm run test:coverage
# Open coverage/index.html in your browser
```

## Test Structure

Tests are co-located with their source files:

```
src/
├── components/
│   ├── Inspector.tsx
│   ├── Inspector.test.tsx
│   ├── Legend.tsx
│   └── Legend.test.tsx
├── utils/
│   ├── urlState.ts
│   └── urlState.test.ts
└── __mocks__/
    └── graphData.ts        # Shared test fixtures
```

## Writing Tests

### Component Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    const onClickMock = vi.fn();
    
    render(<MyComponent onClick={onClickMock} />);
    
    const button = screen.getByRole('button');
    await user.click(button);
    
    expect(onClickMock).toHaveBeenCalled();
  });
});
```

### Utility Tests

```typescript
import { describe, it, expect } from 'vitest';
import { myUtilityFunction } from './myUtility';

describe('myUtilityFunction', () => {
  it('returns expected result', () => {
    const result = myUtilityFunction('input');
    expect(result).toBe('expected output');
  });

  it('handles edge cases', () => {
    expect(myUtilityFunction('')).toBe('');
    expect(myUtilityFunction(null)).toBeUndefined();
  });
});
```

## Test Coverage by Component

### 100% Coverage (Perfect)
- Inspector.tsx
- Legend.tsx
- LoadingSkeleton.tsx
- VirtualList.tsx
- levelOfDetail.ts
- webglDetect.ts

### 80-99% Coverage (Excellent)
- ErrorBoundary.tsx (87%)
- urlState.ts (87%)
- frameThrottle.ts (97%)
- GraphErrorFallback.tsx (80%)
- EdgeBundler.ts (78%)

### 60-79% Coverage (Good)
- ShareButton.tsx (77%)
- App.tsx (62%)
- Controls.tsx (47%)

### Excluded from Coverage
The following components are intentionally excluded from coverage requirements:

- **Admin panels** (Admin.tsx, Dashboard.tsx, Communities.tsx) - Complex UI better suited for E2E tests
- **Graph visualizations** (Graph3D.tsx, Graph2D.tsx, CommunityMap.tsx) - Heavy WebGL/Three.js dependencies requiring extensive mocking
- **Complex algorithms** (communityDetection.ts, apiErrors.ts) - Require specialized testing approaches
- **Type definitions** (types/*.ts) - No executable code

## Mocking

### External Dependencies

```typescript
// Mock external libraries
vi.mock('three', () => ({
  Scene: vi.fn(),
  Camera: vi.fn(),
}));

// Mock internal modules
vi.mock('./utils/webglDetect', () => ({
  detectWebGLSupport: () => true,
}));
```

### Shared Test Fixtures

Use the mock data from `src/__mocks__/graphData.ts`:

```typescript
import { mockGraphData, mockNodes, mockLinks } from '../__mocks__/graphData';

describe('MyGraphComponent', () => {
  it('renders graph data', () => {
    render(<MyGraphComponent data={mockGraphData} />);
    // assertions...
  });
});
```

## Continuous Integration

Tests run automatically on every pull request:

1. Unit tests execute via `npm run test:coverage`
2. Coverage thresholds are enforced (build fails if below requirements)
3. Coverage reports are uploaded to Codecov
4. E2E tests run via Playwright (separate workflow)

## Best Practices

1. **Test behavior, not implementation** - Focus on what the component does, not how it does it
2. **Use Testing Library queries** - Prefer `getByRole`, `getByLabelText` over `getByTestId`
3. **Avoid testing implementation details** - Don't test internal state or private methods
4. **Keep tests simple and readable** - Each test should verify one thing
5. **Mock external dependencies** - Use `vi.mock()` to isolate units under test
6. **Use shared fixtures** - DRY principle applies to test data too
7. **Clean up after tests** - Use `afterEach` to reset state and clear mocks

## Troubleshooting

### Tests timing out
```typescript
// Use fake timers for async operations
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('handles delayed action', () => {
  // ... test code
  vi.advanceTimersByTime(1000);
  // ... assertions
});
```

### Act warnings
```typescript
// Wrap state updates in act()
import { act } from '@testing-library/react';

act(() => {
  // code that causes state updates
});
```

### Mock not working
```typescript
// Ensure mocks are hoisted
vi.mock('./module', () => ({
  // Don't reference variables defined outside the factory
  myFunction: vi.fn(() => 'mocked value'),
}));
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

## Visual Regression Testing

The frontend includes **visual regression tests** using Playwright to catch unintended visual changes in graph rendering.

### Running Visual Tests

```bash
# Run visual regression tests
npm run test:visual

# Run visual tests in UI mode
npm run test:visual:ui

# Update baseline screenshots (after intentional visual changes)
npm run test:visual:update
```

### Test Coverage

Visual regression tests cover:

| Test Scenario | View Mode | Theme | Notes |
|---------------|-----------|-------|-------|
| Empty graph | 3D | Light & Dark | No nodes |
| Small graph (100 nodes) | 3D | Light & Dark | Standard view |
| Small graph (100 nodes) | 2D | Light & Dark | Force layout |
| Small graph (100 nodes) | 3D | Light | Zoomed in |
| Large graph (10k nodes) | 3D | Light & Dark | Performance test |
| Dashboard view | Dashboard | Light & Dark | Statistics |

**Total: 11 visual regression tests**

### How It Works

1. **Deterministic fixtures** - Test data includes fixed node positions for stable rendering
2. **API mocking** - Tests mock `/api/graph` endpoint with deterministic fixture data
3. **Screenshot comparison** - Playwright captures screenshots and compares them to baselines
4. **Pixel diff tolerance** - 1% pixel difference allowed to handle minor rendering variations
5. **CI integration** - Tests run automatically on every pull request

### Test Fixtures

Visual test fixtures are generated with deterministic seeded random data:

- `visual-empty.json` - 0 nodes (empty state)
- `visual-small.json` - 100 nodes (quick test)
- `visual-large.json` - 10,000 nodes (performance/rendering stress test)

Generate new fixtures:
```bash
npx tsx e2e/fixtures/generateVisualFixtures.ts
```

### Updating Baselines

When you make intentional visual changes (new features, design updates):

1. Run `npm run test:visual` to see the failures
2. Review the diff report in `playwright-report/index.html`
3. If changes look correct, update baselines: `npm run test:visual:update`
4. Commit the updated baseline screenshots

### Configuration

Visual test settings in `playwright.config.ts`:

```typescript
expect: {
  toHaveScreenshot: {
    maxDiffPixelRatio: 0.01,  // 1% tolerance
    animations: 'disabled',    // Avoid animation flakiness
    threshold: 0.2,            // Anti-aliasing tolerance
  },
}
```

### CI Behavior

- Visual tests run in a separate CI job after unit tests
- On failure, diff reports are uploaded as GitHub artifacts
- Artifacts are retained for 30 days for investigation
- Tests use headless Chromium for consistency

### Avoiding Flakiness

The visual tests are designed to be stable:

- **Fixed viewport**: 1280x720 for consistent rendering
- **Disabled animations**: Prevents timing-related flakiness  
- **Deterministic data**: Fixed positions ensure graphs render identically
- **Stable wait times**: Tests wait for physics to settle before screenshots
- **Theme pre-initialization**: Uses `addInitScript()` to set theme before page load
- **Consistent browser flags**: Force sRGB color profile, disable GPU vsync

### Troubleshooting

**Tests fail with localStorage SecurityError**
- Ensure `setTheme()` is called BEFORE `page.goto()`
- Use `addInitScript()` to set localStorage before page navigation

**Screenshots differ slightly on CI vs local**
- Increase `maxDiffPixelRatio` tolerance if needed
- Ensure same Playwright/Chromium versions locally and in CI
- Check that browser flags match between environments

**Large graph tests timeout**
- Increase `timeout` in test config for large datasets
- Adjust `waitForGraphStable()` delay for physics settling
