# Setup and Quickstart

This guide gets you from zero to a running stack.

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local frontend builds)
- Go 1.21+ (optional for local backend builds)

## Clone and configure

1. Clone the repo:
   ```bash
   git clone https://github.com/subculture-collective/reddit-cluster-map.git
   cd reddit-cluster-map
   ```

2. **Quick setup** (recommended):
   ```bash
   cd backend
   make setup
   ```
   This creates `.env` from `.env.example` and checks for required tools.

3. Configure `backend/.env`:
   - Set `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` (from https://www.reddit.com/prefs/apps)
   - Set `POSTGRES_PASSWORD` to a strong password
   - Optionally adjust other settings (see comments in `.env.example`)

4. (Optional) Configure `frontend/.env`:
   ```bash
   cp frontend/.env.example frontend/.env
   ```
   For local dev, the defaults should work fine.

### Manual Configuration (Alternative)

If you prefer not to use `make setup`, manually copy the example files:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Then edit `backend/.env` with:
REDDIT_CLIENT_SECRET=<from reddit app>
REDDIT_REDIRECT_URI=<your callback, e.g. https://your.domain/oauth/reddit/callback>
REDDIT_SCOPES="identity read"
REDDIT_USER_AGENT=reddit-cluster-map/0.1 (+your_contact)

POSTGRES_PASSWORD=<choose strong password>
DATABASE_URL=postgres://postgres:${POSTGRES_PASSWORD}@db:5432/reddit_cluster?sslmode=disable

# Optional graph generation knobs
DETAILED_GRAPH=false
POSTS_PER_SUB_IN_GRAPH=10
COMMENTS_PER_POST_IN_GRAPH=50
MAX_AUTHOR_CONTENT_LINKS=3
DISABLE_API_GRAPH_JOB=false
PRECALC_CLEAR_ON_START=false

# Precalc batching & logs (runtime-tuned in Service)
GRAPH_NODE_BATCH_SIZE=1000
GRAPH_LINK_BATCH_SIZE=2000
GRAPH_PROGRESS_INTERVAL=10000
```

Then edit `frontend/.env` with:

```
VITE_API_URL=/api
```

## Required Tools

Before starting, ensure you have:

- Docker and Docker Compose
- Node.js 20+ (for local frontend builds)
- Go 1.21+ (optional for local backend builds)

Check installed tools:
```bash
cd backend
make check-tools
```

Install Go development tools (sqlc and golang-migrate):
```bash
make install-tools
```

## Start services

From `backend/`:

- Start DB, API, crawler, frontend:
  - `docker compose up -d --build`
- **Important**: Run migrations to ensure all database schema changes are applied:
  - `make migrate-up` (or `make migrate-up-local` for local database)
  - Migration 000016 adds position columns (`pos_x`, `pos_y`, `pos_z`) to `graph_nodes` required for layout computation
  - The API will log the position columns status at startup:
    - ✓ Position columns present: All columns detected
    - ⚠️ Position columns missing: Run migrations to add them

To verify position columns exist, check API startup logs:
```bash
make logs-api | grep "Position columns"
```

The API listens on port 8000 inside the network. Frontend serves on port 80 (container) behind your reverse proxy.

## Seed a crawl

### Quick Seed (Automated)

The fastest way to populate the database:

```bash
cd backend
make seed
```

This will enqueue crawl jobs for several popular subreddits (AskReddit, programming, golang, webdev, dataisbeautiful).

### Manual Seed

Alternatively, POST to enqueue individual subreddits:

```
curl -X POST https://<your-domain>/api/crawl -H 'Content-Type: application/json' -d '{"subreddit":"AskReddit"}'
```

Crawler will pull posts/comments and populate the DB.

Check job status:
```bash
curl http://localhost:8000/jobs | jq
# Or for production:
curl https://<your-domain>/jobs | jq
```

Monitor crawler progress:
```bash
make logs-crawler
```

## Generate graph now

- Run the precalculate container once:
  - `docker compose run --rm precalculate /app/precalculate`

Or wait for the API server’s graph job (every hour) to update automatically.

## Frontend access

- Open your domain. The app fetches `/api/graph` via nginx.
- To include precomputed 3D positions in the API response, use: `/api/graph?with_positions=true`
  - Positions are only returned when the `pos_x`, `pos_y`, `pos_z` columns are present and populated

## Local dev (optional)

### Smoke Tests

Verify all API endpoints are working:
```bash
cd backend
make smoke-test
```

This checks connectivity and basic functionality of all API endpoints.

### Backend Development

- Run tests:
  ```bash
  make test
  ```

- Check code formatting and quality:
  ```bash
  make lint
  ```

- Format code:
  ```bash
  make fmt
  ```

- Regenerate sqlc after changing SQL:
  ```bash
  make generate
  ```

Run `make help` for all available targets.

### Frontend Development

From `frontend/`:

- Install dependencies: `npm ci`
- Start dev server: `npm run dev` (proxy to `localhost:8000` is configured in `vite.config.ts`)
- Lint: `npm run lint`
- Type check: `npx tsc --noEmit`
- Build: `npm run build`

### Git Hooks (Recommended)

Install pre-commit hooks for automatic formatting and type checking:
```bash
./scripts/install-hooks.sh
```

This will run checks before each commit to ensure code quality.

See the **[Developer Guide](./developer-guide.md)** for comprehensive development workflows and best practices.

## Troubleshooting

- 403 on user listings: app-only OAuth may be blocked; code falls back to search/public or skips.
- Rate limits: All requests are globally paced (601ms). Tune by editing `internal/crawler/ratelimit.go`.
- Double /api in URL: ensure `VITE_API_URL` has no trailing slash in `frontend/.env`.
- `/api/graph` looks empty: ensure precalc has run and `DETAILED_GRAPH` settings are set as expected. The API falls back to legacy JSON only when precalculated tables are empty.
- Precalc slow: adjust `GRAPH_NODE_BATCH_SIZE`, `GRAPH_LINK_BATCH_SIZE`, `GRAPH_PROGRESS_INTERVAL` and consider reducing `POSTS_PER_SUB_IN_GRAPH` or `COMMENTS_PER_POST_IN_GRAPH`.
- **Position columns errors** (`pos_x/pos_y/pos_z does not exist`): Run `make migrate-up` or `make migrate-up-local` to apply migration 000016. New databases created via docker-compose already include these columns in schema.sql. For existing databases, the migration is idempotent and safe to run multiple times.
