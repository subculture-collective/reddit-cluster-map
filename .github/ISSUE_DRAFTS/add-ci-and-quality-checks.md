Title: Add CI workflows for backend, frontend, security, and images

Summary

Set up GitHub Actions CI that lint/build/tests the Go backend and the Vite/TypeScript frontend, runs basic security/static checks, and validates Docker image builds on PRs. On main branch, publish build artifacts and optionally push container images (behind a flag/secrets).

Why

- Catch regressions early across backend and frontend.
- Keep repo standards consistent: formatting, linting, tests, and security checks.
- Ensure Dockerfiles continue to build as we evolve base images and deps.

Scope

Create the following GitHub Actions workflows in `.github/workflows/`:

1. Backend CI (Go)

- Triggers: pull_request, push to main.
- Runs on ubuntu-latest with Go 1.24.x.
- Steps:
  - Checkout
  - Setup Go 1.24.x
  - Cache Go modules and build cache
  - Verify formatting: `gofmt -l .` (fail if any file listed)
  - Static analysis: `go vet ./...`
  - Build: `go build ./...`
  - Unit tests: `make test` (equivalent to `go test ./...`)
  - Integration tests (separate job) against Postgres service:
    - Start Postgres service (15/16 ok)
    - Install `migrate` CLI
    - Set `TEST_DATABASE_URL` to the service connection
    - Run migrations from `backend/migrations` against the service
    - Run `make test-integration` (only runs Integration tests in `internal/graph`)

Notes:

- Module path is `github.com/onnwee/reddit-cluster-map/backend` and go directive is 1.24.6 in `backend/go.mod`.
- Use working-directory: `backend` in relevant steps.

2. Frontend CI (Vite + TypeScript)

- Triggers: pull_request, push to main.
- Node: 22.x (compatible with Vite 6/TS 5.8).
- Steps:
  - Checkout
  - Setup Node 22.x
  - Cache npm cache and `~/.npm` based on `frontend/package-lock.json`
  - Install: `npm ci`
  - Lint: `npm run lint`
  - Build: `npm run build` (runs `tsc -b && vite build`)

3. Docker image build check

- Triggers: pull_request, push to main, workflow_dispatch.
- Steps:
  - Setup Docker Buildx
  - Build — no push on PR: validate `backend/Dockerfile`, `backend/Dockerfile.crawler`, `backend/Dockerfile.precalculate`, and `frontend/Dockerfile`
  - On push to main (optional when secrets present), push to GHCR or Docker Hub

4. CodeQL (Go, JavaScript)

- Triggers: pull_request, push to main, scheduled weekly.
- Analyze languages: go, javascript.

5. Optional: Trivy security scan (containers)

- Triggers: pull_request to scan built images (or filesystem).
- Only as advisory; can be set to warn-only initially.

Acceptance criteria

- On every PR, the following required checks pass:
  - Backend: format+vet+build+unit tests
  - Backend: integration tests (can be allowed-to-fail initially if flakiness is a concern)
  - Frontend: lint+build
  - Docker: build validation (no push on PR)
  - CodeQL: completes without high/critical findings
- On pushes to `main`:
  - All of the above run
  - If `IMAGE_PUBLISH=true` and registry secrets are available, container images are pushed for: api, crawler, precalculate, and frontend
- Caching is in place for Go and npm to keep runs fast
- Workflows use concurrency groups to auto-cancel superseded runs per-branch

Proposed files (high level)

- `.github/workflows/backend-ci.yml`
- `.github/workflows/frontend-ci.yml`
- `.github/workflows/docker-build.yml`
- `.github/workflows/codeql.yml`

Proposed YAML sketches

Backend (Go):

```yaml
name: backend-ci

on:
  pull_request:
    paths:
      - "backend/**"
      - ".github/workflows/backend-ci.yml"
  push:
    branches: [main]
    paths:
      - "backend/**"

concurrency:
  group: backend-ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  unit:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.24.x"
          check-latest: true
      - name: Cache Go modules
        uses: actions/cache@v4
        with:
          path: |
            ~/.cache/go-build
            ~/go/pkg/mod
          key: ${{ runner.os }}-go-${{ hashFiles('backend/go.sum') }}
          restore-keys: ${{ runner.os }}-go-
      - name: Verify formatting
        run: |
          fmt=$(gofmt -l . | wc -l)
          if [ "$fmt" != "0" ]; then
            echo "Go files need formatting. Run 'gofmt -w .'"; exit 1; fi
      - name: Vet
        run: go vet ./...
      - name: Build
        run: go build ./...
      - name: Unit tests
        run: make test

  integration:
    runs-on: ubuntu-latest
    needs: unit
    defaults:
      run:
        working-directory: backend
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: reddit_cluster
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports: ["5432:5432"]
        options: >-
          --health-cmd="pg_isready -U postgres" --health-interval=10s --health-timeout=5s --health-retries=5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.24.x"
          check-latest: true
      - name: Install migrate CLI
        run: |
          curl -L https://github.com/golang-migrate/migrate/releases/download/v4.17.0/migrate.linux-amd64.tar.gz | tar xz
          sudo mv migrate /usr/local/bin/
      - name: Run migrations
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/reddit_cluster?sslmode=disable
        run: migrate -path migrations -database "$DATABASE_URL" up
      - name: Integration tests
        env:
          TEST_DATABASE_URL: postgres://postgres:postgres@localhost:5432/reddit_cluster?sslmode=disable
        run: make test-integration
```

Frontend (Vite + TS):

```yaml
name: frontend-ci

on:
  pull_request:
    paths:
      - "frontend/**"
      - ".github/workflows/frontend-ci.yml"
  push:
    branches: [main]
    paths:
      - "frontend/**"

concurrency:
  group: frontend-ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22.x"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json
      - name: Install
        run: npm ci
      - name: Lint
        run: npm run lint
      - name: Build
        run: npm run build
```

Docker build validation:

```yaml
name: docker-build

on:
  pull_request:
    paths:
      - "backend/Dockerfile*"
      - "frontend/Dockerfile"
      - ".github/workflows/docker-build.yml"
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Build backend api
        uses: docker/build-push-action@v6
        with:
          context: ./backend
          file: ./backend/Dockerfile
          push: false
      - name: Build crawler
        uses: docker/build-push-action@v6
        with:
          context: ./backend
          file: ./backend/Dockerfile.crawler
          push: false
      - name: Build precalculate
        uses: docker/build-push-action@v6
        with:
          context: ./backend
          file: ./backend/Dockerfile.precalculate
          push: false
      - name: Build frontend
        uses: docker/build-push-action@v6
        with:
          context: ./frontend
          file: ./frontend/Dockerfile
          push: false
```

CodeQL:

```yaml
name: codeql

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: "0 3 * * 1"

jobs:
  analyze:
    uses: github/codeql-action/.github/workflows/codeql.yml@v3
    with:
      languages: go, javascript
```

Secrets and settings

- No secrets required for PR checks.
- For image publishing to GHCR on `main`, configure:
  - `permissions: packages: write` on the job
  - or Docker Hub: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`
- Optionally set `IMAGE_PUBLISH=true` repository/organization variable to toggle pushes.

Open questions

- Should integration tests be required for PRs, or optional until they’re stable?
- Preferred container registry? GHCR vs Docker Hub.
- Keep Trivy/code scanning as warning-only initially?

References

- Backend Makefile targets: `make test`, `make test-integration`, `make migrate-up`, `make migrate-up-local`
- Frontend scripts in `frontend/package.json`: `lint`, `build`
