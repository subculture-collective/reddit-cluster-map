# Contributing to Reddit Cluster Map

Thank you for your interest in contributing to Reddit Cluster Map! This document provides guidelines and best practices for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)
- [Community Guidelines](#community-guidelines)

## Getting Started

### Prerequisites

Before you begin, ensure you have:

- **Docker and Docker Compose** (Docker Engine 20.10+ recommended)
- **Go 1.21+** (for local backend development)
- **Node.js 20+** (for local frontend development)
- **Git** (for version control)
- **A GitHub account** (for submitting pull requests)

### Initial Setup

1. **Fork the repository** on GitHub
   - Visit https://github.com/subculture-collective/reddit-cluster-map
   - Click "Fork" in the top-right corner

2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/reddit-cluster-map.git
   cd reddit-cluster-map
   ```

3. **Add upstream remote:**
   ```bash
   git remote add upstream https://github.com/subculture-collective/reddit-cluster-map.git
   ```

4. **Set up the development environment:**
   ```bash
   cd backend
   make setup
   ```
   
   This creates `.env` from `.env.example` and checks for required tools.

5. **Configure environment variables:**
   
   Edit `backend/.env` and set:
   - `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` (get from https://www.reddit.com/prefs/apps)
   - `POSTGRES_PASSWORD` (choose a strong password)

6. **Install Git hooks** (recommended):
   ```bash
   cd .. # back to repo root
   ./scripts/install-hooks.sh
   ```
   
   This installs pre-commit hooks for automatic formatting and type checking.

7. **Start services:**
   ```bash
   cd backend
   docker network create web  # First time only
   docker compose up -d --build
   make migrate-up-local
   ```

8. **Verify setup:**
   ```bash
   make smoke-test
   ```

For detailed setup instructions, see [docs/setup.md](./docs/setup.md).

---

## Development Workflow

### Creating a Feature Branch

Always create a new branch for your work:

```bash
# Ensure your main branch is up to date
git checkout main
git pull upstream main

# Create a new feature branch
git checkout -b feature/your-feature-name
```

**Branch naming conventions:**
- `feature/` - New features (e.g., `feature/add-search-api`)
- `fix/` - Bug fixes (e.g., `fix/crawler-rate-limit`)
- `docs/` - Documentation changes (e.g., `docs/update-setup-guide`)
- `refactor/` - Code refactoring (e.g., `refactor/simplify-graph-service`)
- `test/` - Test additions/improvements (e.g., `test/add-api-integration-tests`)

### Making Changes

1. **Make your changes** in small, logical commits
2. **Test frequently** as you develop
3. **Follow coding standards** (see below)
4. **Update documentation** if needed
5. **Add tests** for new functionality

### Testing Your Changes

Run the appropriate tests for your changes:

**Backend (Go):**
```bash
cd backend

# Format code
make fmt

# Lint code
make lint

# Run unit tests
make test

# Run integration tests
make test-integration-docker
```

**Frontend (React/TypeScript):**
```bash
cd frontend

# Install dependencies
npm ci

# Type check
npx tsc --noEmit

# Lint
npm run lint

# Fix linting issues automatically
npm run lint -- --fix

# Build
npm run build
```

**Full stack smoke test:**
```bash
cd backend
docker compose up -d --build
make smoke-test
```

### Committing Changes

Our pre-commit hooks automatically check:
- Go code formatting (gofmt)
- Go static analysis (go vet)
- TypeScript/JavaScript linting (ESLint)
- TypeScript type checking

**Commit message format:**

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Test additions or modifications
- `chore`: Maintenance tasks, dependency updates

**Examples:**

```
feat(api): add search endpoint with fuzzy matching

Implements a new /api/search endpoint that supports fuzzy text
search across nodes using PostgreSQL full-text search.

Closes #123
```

```
fix(crawler): respect Reddit API retry-after header

The crawler was not properly handling Retry-After headers from
Reddit API, leading to rate limit violations.

Fixes #456
```

### Keeping Your Branch Updated

Regularly sync with upstream to avoid conflicts:

```bash
git checkout main
git pull upstream main
git checkout feature/your-feature-name
git rebase main
```

If you encounter conflicts, resolve them and continue:

```bash
# Edit conflicting files
git add .
git rebase --continue
```

---

## Coding Standards

### Go Code Standards

**Style:**
- Follow standard Go conventions
- Use `gofmt` for formatting (run `make fmt`)
- Pass `go vet` checks (run `make lint`)
- Use meaningful variable and function names
- Keep functions focused and small (< 50 lines when possible)

**Structure:**
```go
// Package comment explaining the package purpose
package mypackage

import (
    // Standard library imports first
    "context"
    "fmt"
    
    // Third-party imports second
    "github.com/go-chi/chi/v5"
    
    // Local imports last
    "github.com/subculture-collective/reddit-cluster-map/backend/internal/db"
)

// Exported functions should have doc comments
// FetchUserData retrieves user data from the database.
func FetchUserData(ctx context.Context, userID int64) (*User, error) {
    // Implementation
}

// Unexported functions can have shorter comments
func validateInput(input string) error {
    // Implementation
}
```

**Error Handling:**
```go
// Good: Always check errors
result, err := someFunction()
if err != nil {
    return fmt.Errorf("failed to do something: %w", err)
}

// Good: Wrap errors with context
if err := updateDatabase(); err != nil {
    return fmt.Errorf("updateDatabase failed for user %d: %w", userID, err)
}

// Bad: Ignoring errors
result, _ := someFunction()  // Don't do this!
```

**Context Usage:**
- Always accept `context.Context` as the first parameter for operations that may block
- Pass context through the call chain
- Use context for cancellation and timeouts

```go
func ProcessData(ctx context.Context, data []byte) error {
    // Use context in database calls
    result, err := queries.GetUser(ctx, userID)
    if err != nil {
        return err
    }
    
    // Check for cancellation
    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
    }
    
    // Continue processing
}
```

**Testing:**
```go
func TestFetchUserData(t *testing.T) {
    // Use table-driven tests
    tests := []struct {
        name    string
        userID  int64
        want    *User
        wantErr bool
    }{
        {"valid user", 123, &User{ID: 123}, false},
        {"invalid user", -1, nil, true},
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := FetchUserData(context.Background(), tt.userID)
            if (err != nil) != tt.wantErr {
                t.Errorf("FetchUserData() error = %v, wantErr %v", err, tt.wantErr)
                return
            }
            if !reflect.DeepEqual(got, tt.want) {
                t.Errorf("FetchUserData() = %v, want %v", got, tt.want)
            }
        })
    }
}
```

### TypeScript/React Standards

**Style:**
- Use TypeScript for all code (no plain JavaScript)
- Follow ESLint configuration
- Use functional components with hooks
- Prefer const over let
- Use meaningful names for variables and functions

**Component Structure:**
```typescript
import React, { useState, useEffect } from 'react';

interface MyComponentProps {
  title: string;
  onAction: (value: string) => void;
}

/**
 * MyComponent renders a title and action button.
 */
export const MyComponent: React.FC<MyComponentProps> = ({ title, onAction }) => {
  const [state, setState] = useState<string>('');

  useEffect(() => {
    // Side effects here
    return () => {
      // Cleanup
    };
  }, []);

  const handleClick = () => {
    onAction(state);
  };

  return (
    <div className="my-component">
      <h2>{title}</h2>
      <button onClick={handleClick}>Action</button>
    </div>
  );
};
```

**Type Safety:**
```typescript
// Good: Define interfaces for all data structures
interface GraphNode {
  id: string;
  name: string;
  val: string;
  type: 'user' | 'subreddit' | 'post' | 'comment';
}

// Good: Type function parameters and return values
function filterNodes(nodes: GraphNode[], type: string): GraphNode[] {
  return nodes.filter(node => node.type === type);
}

// Bad: Using 'any'
function processData(data: any): any {  // Avoid 'any'!
  // ...
}
```

**Hooks Best Practices:**
```typescript
// Good: Extract custom hooks for reusable logic
function useGraphData(maxNodes: number) {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchGraphData(maxNodes)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [maxNodes]);

  return { data, loading, error };
}
```

### SQL Standards

**Style:**
- Use lowercase for SQL keywords in query files
- Use descriptive query names in sqlc comments
- Keep queries focused and efficient
- Add comments for complex queries

**Example (in `backend/internal/queries/*.sql`):**
```sql
-- name: GetUserByUsername :one
-- Retrieves a user by their unique username.
select id, username, created_at, last_seen_at
from users
where username = $1
limit 1;

-- name: ListActiveUsers :many
-- Lists users who have been active within the specified number of days.
select u.id, u.username, u.last_seen_at
from users u
where u.last_seen_at > now() - make_interval(days => $1)
order by u.last_seen_at desc
limit $2;
```

**Performance:**
- Always consider index usage
- Use EXPLAIN ANALYZE to verify query plans
- Avoid SELECT * in production queries
- Use appropriate JOINs and WHERE clauses

### Documentation Standards

**Code Comments:**
- Document exported functions, types, and packages
- Explain "why", not "what" (code shows what)
- Keep comments up to date with code changes

**Markdown Documentation:**
- Use clear headings and structure
- Include code examples for complex concepts
- Add links to related documentation
- Keep line length reasonable (< 120 characters when possible)

---

## Pull Request Guidelines

### Before Submitting

**Checklist:**
- [ ] Code follows project coding standards
- [ ] All tests pass locally
- [ ] New tests added for new functionality
- [ ] Documentation updated if needed
- [ ] Commit messages follow convention
- [ ] Branch is up to date with main
- [ ] No unnecessary files included (build artifacts, IDE configs, etc.)

### Creating a Pull Request

1. **Push your branch to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a pull request** on GitHub:
   - Go to your fork on GitHub
   - Click "Compare & pull request"
   - Ensure base repository is `subculture-collective/reddit-cluster-map` and base branch is `main`

3. **Fill out the PR template:**
   
   ```markdown
   ## Description
   
   Brief description of changes
   
   ## Type of Change
   
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update
   
   ## Testing
   
   Describe how you tested your changes
   
   ## Related Issues
   
   Closes #123
   ```

4. **Request review** from maintainers

### PR Review Process

**What reviewers look for:**
- Code quality and maintainability
- Test coverage and correctness
- Documentation completeness
- Performance implications
- Security considerations
- Backward compatibility

**Responding to feedback:**
- Be respectful and professional
- Ask questions if feedback is unclear
- Make requested changes in new commits
- Mark conversations as resolved once addressed
- Re-request review after making changes

**Getting your PR merged:**
- All CI checks must pass
- At least one approval from a maintainer
- No unresolved conversations
- Branch must be up to date with main

### After Merge

1. **Delete your branch:**
   ```bash
   git branch -d feature/your-feature-name
   git push origin --delete feature/your-feature-name
   ```

2. **Update your local main:**
   ```bash
   git checkout main
   git pull upstream main
   ```

3. **Celebrate!** 🎉 You've contributed to the project!

---

## Testing Requirements

### Backend Testing

**Unit Tests:**
- Required for all new functions and methods
- Use table-driven tests where appropriate
- Mock external dependencies
- Aim for > 70% code coverage

**Example:**
```go
func TestGraphService_GenerateNodes(t *testing.T) {
    tests := []struct {
        name       string
        input      []Subreddit
        wantCount  int
        wantErr    bool
    }{
        {"empty input", []Subreddit{}, 0, false},
        {"single subreddit", []Subreddit{{ID: 1, Name: "test"}}, 1, false},
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Test implementation
        })
    }
}
```

**Integration Tests:**
- Test database interactions
- Use `TEST_DATABASE_URL` for test database
- Clean up test data in teardown
- Run with: `make test-integration-docker`

**Running Tests:**
```bash
cd backend

# All tests
make test

# Specific package
go test ./internal/graph -v

# With coverage
go test -cover ./...

# Integration tests
make test-integration-docker
```

### Frontend Testing

While formal unit tests are not currently required, ensure:
- TypeScript compilation succeeds: `npx tsc --noEmit`
- ESLint passes: `npm run lint`
- Build succeeds: `npm run build`
- Manual testing of UI changes

**Future: Jest/React Testing Library**

We plan to add formal frontend tests. Example:
```typescript
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders title', () => {
    render(<MyComponent title="Test" onAction={() => {}} />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
```

### Manual Testing

For UI changes:
1. Build and run locally: `docker compose up -d --build`
2. Test all affected functionality
3. Test on different browsers (Chrome, Firefox, Safari)
4. Test responsive design (mobile, tablet, desktop)
5. Take screenshots of changes to include in PR

---

## Documentation

### When to Update Documentation

Update documentation when you:
- Add new features or APIs
- Change existing behavior
- Add new environment variables
- Modify configuration options
- Fix bugs that affect usage

### Documentation Locations

- **README.md** - Project overview and quick start
- **docs/setup.md** - Detailed setup instructions
- **docs/developer-guide.md** - Development workflows
- **docs/architecture.md** - System architecture and design
- **docs/api.md** - API endpoint documentation
- **docs/runbooks.md** - Operational procedures
- **CONTRIBUTING.md** - This file!
- **Inline code comments** - For complex logic

### Documentation Style

- Use clear, concise language
- Include code examples
- Add screenshots for UI features
- Keep examples up to date
- Link to related documentation

---

## Community Guidelines

### Code of Conduct

We are committed to providing a welcoming and inclusive environment. All contributors are expected to:

- **Be respectful** - Treat others with respect and consideration
- **Be collaborative** - Work together toward common goals
- **Be constructive** - Provide helpful, actionable feedback
- **Be patient** - Remember that everyone has different experience levels
- **Be inclusive** - Welcome newcomers and help them get started

### Communication

**GitHub Issues:**
- Search existing issues before creating new ones
- Use issue templates when available
- Provide clear, detailed descriptions
- Include steps to reproduce for bugs
- Be responsive to questions and feedback

**Pull Request Discussions:**
- Keep discussions focused on the code
- Be open to feedback and alternative approaches
- Ask questions if something is unclear
- Thank reviewers for their time

**Getting Help:**
- Check documentation first
- Search existing issues and discussions
- Ask questions in new issues with "question" label
- Be specific about what you've tried

### Recognition

We value all contributions, including:
- Code contributions
- Bug reports
- Documentation improvements
- Feature suggestions
- Code reviews
- Helping other users

Contributors will be recognized in release notes and the project README.

---

## Additional Resources

### Project Documentation

- [Setup Guide](./docs/setup.md) - Getting started
- [Developer Guide](./docs/developer-guide.md) - Development workflows
- [Architecture Overview](./docs/architecture.md) - System design
- [API Documentation](./docs/api.md) - API endpoints
- [Runbooks](./docs/runbooks.md) - Operational procedures
- [Monitoring Guide](./docs/monitoring.md) - Metrics and alerts

### External Resources

- [Go Official Documentation](https://go.dev/doc/)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Docker Documentation](https://docs.docker.com/)

### Tools and Libraries

- [sqlc](https://docs.sqlc.dev/) - SQL code generation
- [golang-migrate](https://github.com/golang-migrate/migrate) - Database migrations
- [Chi Router](https://github.com/go-chi/chi) - HTTP routing
- [react-force-graph-3d](https://github.com/vasturiano/react-force-graph) - 3D visualization

---

## Questions?

If you have questions about contributing:

1. Check the [Developer Guide](./docs/developer-guide.md)
2. Search [existing issues](https://github.com/subculture-collective/reddit-cluster-map/issues)
3. Open a new issue with the "question" label

Thank you for contributing to Reddit Cluster Map! 🚀
