# CI/CD Pipeline Documentation

This document describes the CI/CD pipeline for the Reddit Cluster Map project.

## Overview

The project uses GitHub Actions for continuous integration, deployment, and release management. The pipeline consists of three main workflows:

1. **CI Workflow** (`ci.yml`) - Runs on every push and pull request
2. **Publish Workflow** (`publish.yml`) - Builds and publishes Docker images
3. **Release Workflow** (`release.yml`) - Automates GitHub releases with changelogs

## Workflows

### CI Workflow

**Triggers:** Push to `main` or `develop` branches, and pull requests

**Jobs:**
- `test-backend`: Runs Go tests with PostgreSQL service
  - Sets up Go 1.24.9
  - Runs `go vet` for static analysis
  - Runs tests with race detection
  - Uploads coverage reports to Codecov

- `test-frontend`: Validates frontend build
  - Sets up Node.js 20
  - Installs dependencies
  - Runs linter (if available)
  - Runs tests (if available)
  - Builds the frontend

- `build-backend-images`: Builds Docker images for all backend components
  - Matrix build for: server, crawler, precalculate
  - Uses Docker Buildx for efficient builds
  - Leverages GitHub Actions cache

- `build-frontend-image`: Builds frontend Docker image
  - Uses Docker Buildx
  - Leverages GitHub Actions cache

### Publish Workflow

**Triggers:** 
- Push to tags matching `v*.*.*` (e.g., v1.0.0)
- Manual workflow dispatch

**Jobs:**
- `build-and-push-backend`: Builds and pushes backend images to GHCR
  - Matrix build for: server, crawler, precalculate
  - Multi-architecture: linux/amd64, linux/arm64
  - Auto-tags with version, major.minor, major, sha, and latest
  - Pushes to GitHub Container Registry (ghcr.io)

- `build-and-push-frontend`: Builds and pushes frontend image to GHCR
  - Multi-architecture: linux/amd64, linux/arm64
  - Same tagging strategy as backend

**Image Naming:**
- Backend Server: `ghcr.io/onnwee/reddit-cluster-map-server`
- Crawler: `ghcr.io/onnwee/reddit-cluster-map-crawler`
- Precalculate: `ghcr.io/onnwee/reddit-cluster-map-precalculate`
- Frontend: `ghcr.io/onnwee/reddit-cluster-map-frontend`

### Release Workflow

**Triggers:** Push to tags matching `v*.*.*`

**Jobs:**
- `create-release`: Creates a GitHub release with an automated changelog
  - Fetches git history
  - Generates changelog by categorizing commits:
    - Features (commits starting with `feat` or `feature`)
    - Bug Fixes (commits starting with `fix` or `bugfix`)
    - Documentation (commits starting with `docs`)
    - Other Changes
  - Creates a release on GitHub
  - Marks pre-releases for tags containing `-` (e.g., v1.0.0-beta)

## Docker Image Optimizations

All Dockerfiles have been optimized for:

1. **Better dependency caching**: `go.mod` and `go.sum` are copied first
2. **Verification**: `go mod verify` ensures dependency integrity
3. **Version information**: Build arguments inject version, commit, and build time
4. **Size optimization**: `-ldflags "-s -w"` removes debug info and symbol tables
5. **Multi-stage builds**: Separate build and runtime stages

## Usage

### Running Tests Locally

Backend:
```bash
cd backend
go test -v -race ./...
```

Frontend:
```bash
cd frontend
npm ci
npm test
npm run build
```

### Building Docker Images Locally

```bash
# Server
docker build -t reddit-cluster-server:local \
  --build-arg VERSION=local \
  --build-arg COMMIT=$(git rev-parse HEAD) \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -f backend/Dockerfile backend/

# Crawler
docker build -t reddit-cluster-crawler:local \
  --build-arg VERSION=local \
  --build-arg COMMIT=$(git rev-parse HEAD) \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -f backend/Dockerfile.crawler backend/

# Precalculate
docker build -t reddit-cluster-precalculate:local \
  --build-arg VERSION=local \
  --build-arg COMMIT=$(git rev-parse HEAD) \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -f backend/Dockerfile.precalculate backend/

# Frontend
docker build -t reddit-cluster-frontend:local frontend/
```

### Creating a Release

1. Ensure all changes are committed and pushed
2. Create and push a tag:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```
3. The release workflow will automatically:
   - Generate a changelog
   - Create a GitHub release
   - Trigger the publish workflow to build and push Docker images

### Pulling Published Images

```bash
# Pull latest images
docker pull ghcr.io/onnwee/reddit-cluster-map-server:latest
docker pull ghcr.io/onnwee/reddit-cluster-map-crawler:latest
docker pull ghcr.io/onnwee/reddit-cluster-map-precalculate:latest
docker pull ghcr.io/onnwee/reddit-cluster-map-frontend:latest

# Pull specific version
docker pull ghcr.io/onnwee/reddit-cluster-map-server:v1.0.0
```

## Commit Message Conventions

To get the most benefit from the automated changelog, use conventional commit messages:

- `feat: Add new feature` - For new features
- `fix: Fix bug in component` - For bug fixes
- `docs: Update documentation` - For documentation changes
- `chore: Update dependencies` - For maintenance tasks
- `refactor: Refactor code` - For code refactoring
- `test: Add tests` - For adding tests

## Troubleshooting

### Workflow Permissions

If workflows fail with permission errors:
1. Go to repository Settings → Actions → General
2. Under "Workflow permissions", select "Read and write permissions"
3. Enable "Allow GitHub Actions to create and approve pull requests"

### Docker Registry Authentication

Images are published to GitHub Container Registry (GHCR). The `GITHUB_TOKEN` is automatically provided by GitHub Actions. For pulling public images, no authentication is needed. For private images:

```bash
echo $PAT | docker login ghcr.io -u USERNAME --password-stdin
```

Where `PAT` is a Personal Access Token with `read:packages` scope.

## Future Improvements

- Add integration tests to CI
- Add security scanning (e.g., Trivy, Snyk)
- Add SBOM generation
- Add automated dependency updates (Dependabot/Renovate)
- Add deployment workflows for staging/production environments
