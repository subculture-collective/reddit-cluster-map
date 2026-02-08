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
