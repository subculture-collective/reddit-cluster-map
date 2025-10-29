# Testing Guide

This document describes the testing infrastructure and how to run tests for the reddit-cluster-map project.

## Overview

The project has comprehensive test coverage across three categories:
- **Backend Unit Tests**: Test individual Go packages and functions
- **Backend Integration Tests**: Test database operations with real Postgres
- **Frontend Unit/Component Tests**: Test React components and utilities with Vitest
- **Frontend E2E Tests**: Test full application flows with Playwright

## Backend Testing

### Prerequisites

- Go 1.24.9 or later
- Docker and Docker Compose (for integration tests)
- PostgreSQL (optional, for local integration tests)

### Unit Tests

Unit tests cover handlers, utilities, HTTP retry logic, and other backend components.

**Run all unit tests:**
```bash
cd backend
make test
# or directly:
go test ./...
```

**Run specific package tests:**
```bash
go test ./internal/api/handlers -v
go test ./internal/httpx -v
go test ./internal/graph -v
```

**Run with coverage:**
```bash
go test -cover ./...
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

### Integration Tests

Integration tests verify database operations and graph precalculation with a real Postgres instance.

**Option 1: With dockerized Postgres (recommended):**
```bash
cd backend
make test-integration-docker
```

This will:
1. Start a test Postgres container (port 5433)
2. Initialize the schema
3. Run integration tests
4. Clean up the container

**Option 2: With existing database:**
```bash
cd backend
export TEST_DATABASE_URL="postgres://user:pass@localhost:5432/testdb?sslmode=disable"
make test-integration
# or:
go test ./internal/graph -run Integration -v
```

### Test Coverage

Current backend test coverage includes:
- ✓ API handlers (health, status, jobs, graph, crawl)
- ✓ HTTP retry logic (backoff, retry-after, context handling)
- ✓ Graph service helpers (UTF-8 truncation, progress logging)
- ✓ Middleware (CORS, security, rate limiting, recovery)
- ✓ Crawler components (rate limiting, token management)
- ✓ Metrics and tracing
- ✓ Integration tests for graph precalculation

## Frontend Testing

### Prerequisites

- Node.js 18+ and npm
- Chromium browser (automatically installed by Playwright)

### Unit and Component Tests

Frontend tests use Vitest with React Testing Library.

**Install dependencies:**
```bash
cd frontend
npm install
```

**Run tests in watch mode:**
```bash
npm test
```

**Run tests once (CI mode):**
```bash
npm run test:run
```

**Run with UI:**
```bash
npm run test:ui
```

**Run with coverage:**
```bash
npm run test:run -- --coverage
```

### E2E Tests

E2E tests use Playwright to test the full application in a real browser.

**Run e2e tests:**
```bash
cd frontend
npm run test:e2e
```

**Run with UI:**
```bash
npm run test:e2e:ui
```

**Run specific test:**
```bash
npx playwright test e2e/smoke.spec.ts
```

**Debug tests:**
```bash
npx playwright test --debug
```

### Test Coverage

Current frontend test coverage includes:
- ✓ Graph3D component (rendering, props, mocking)
- ✓ Graph2D component (rendering, layout options)
- ✓ CommunityMap component (community detection display)
- ✓ Level-of-detail utilities (opacity, visibility calculations)
- ✓ E2E smoke tests (homepage, navigation, rendering)

## CI/CD Integration

Tests are designed to run in CI environments:

### GitHub Actions Example

```yaml
backend-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-go@v4
      with:
        go-version: '1.24.9'
    - name: Run unit tests
      run: cd backend && go test ./...
    - name: Run integration tests
      run: cd backend && make test-integration-docker

frontend-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - name: Install dependencies
      run: cd frontend && npm ci
    - name: Run unit tests
      run: cd frontend && npm run test:run
    - name: Run e2e tests
      run: cd frontend && npm run test:e2e
```

## Writing Tests

### Backend Test Example

```go
package handlers

import (
    "net/http"
    "net/http/httptest"
    "testing"
)

func TestHealth(t *testing.T) {
    rr := httptest.NewRecorder()
    req := httptest.NewRequest(http.MethodGet, "/health", nil)
    
    Health(rr, req)
    
    if rr.Code != http.StatusOK {
        t.Fatalf("expected 200, got %d", rr.Code)
    }
}
```

### Frontend Component Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('renders without crashing', () => {
    const { container } = render(<MyComponent />);
    expect(container).toBeTruthy();
  });

  it('displays correct text', () => {
    render(<MyComponent text="Hello" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test('user can navigate to page', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Communities');
  await expect(page).toHaveURL(/.*communities/);
});
```

## Troubleshooting

### Backend

**Issue: Integration tests fail to connect to database**
- Ensure Docker is running
- Check that port 5433 is not in use
- Wait longer for database initialization (adjust sleep in Makefile)

**Issue: Tests pass locally but fail in CI**
- Check Go version matches
- Ensure test isolation (avoid shared state)
- Use `t.Cleanup()` for proper teardown

### Frontend

**Issue: Vitest can't find modules**
- Check `vite.config.ts` test configuration
- Ensure dependencies are installed: `npm ci`
- Clear node_modules and reinstall if needed

**Issue: Playwright tests timeout**
- Increase timeout in `playwright.config.ts`
- Check that dev server starts correctly
- Use `--debug` flag to see what's happening

**Issue: Component tests have "act" warnings**
- Wrap state updates in `act()` from `@testing-library/react`
- Use `waitFor()` for async state changes
- Check that async effects complete before assertions

## Best Practices

1. **Keep tests fast**: Mock external dependencies
2. **Test behavior, not implementation**: Focus on user-facing functionality
3. **Write descriptive test names**: Explain what is being tested and expected outcome
4. **Use test fixtures**: Share common test data and setup
5. **Clean up after tests**: Use `t.Cleanup()` (Go) or `afterEach()` (Vitest)
6. **Test edge cases**: Error conditions, empty data, boundary values
7. **Avoid flaky tests**: Don't rely on timing, use proper waits
8. **Run tests before committing**: Ensure changes don't break existing tests

## Resources

- [Go Testing Documentation](https://golang.org/pkg/testing/)
- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Playwright Documentation](https://playwright.dev/)
