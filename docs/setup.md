# Setup and Quickstart

This guide gets you from zero to a running stack.

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local frontend builds)
- Go 1.21+ (optional for local backend builds)

## Clone and configure

1. Clone the repo.
2. Backend env: copy `backend/.env.example` to `backend/.env` and fill:

```
REDDIT_CLIENT_ID=<from reddit app>
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

3. Frontend env: set `frontend/.env`:

```
VITE_API_URL=/api
```

## Start services

From `backend/`:

- Start DB, API, crawler, frontend:
  - `docker compose up -d --build`
- **Important**: Run migrations to ensure all database schema changes are applied:
  - `make migrate-up` (or `make migrate-up-local` for local database)
  - Migration 000016 adds position columns (`pos_x`, `pos_y`, `pos_z`) to `graph_nodes` required for layout computation

The API listens on port 8000 inside the network. Frontend serves on port 80 (container) behind your reverse proxy.

## Seed a crawl

- POST to enqueue a subreddit:

```
curl -X POST https://<your-domain>/api/crawl -H 'Content-Type: application/json' -d '{"subreddit":"AskReddit"}'
```

Crawler will pull posts/comments and populate the DB.

## Generate graph now

- Run the precalculate container once:
  - `docker compose run --rm precalculate /app/precalculate`

Or wait for the API server’s graph job (every hour) to update automatically.

## Frontend access

- Open your domain. The app fetches `/api/graph` via nginx.

## Local dev (optional)

- Backend tests: `go test ./...`
- Frontend dev: from `frontend/`, `npm ci && npm run dev` (proxy to `localhost:8000` is configured in `vite.config.ts`).
- Regenerate sqlc after changing SQL: from `backend/`, `make sqlc` (alias `make generate`).

## Troubleshooting

- 403 on user listings: app-only OAuth may be blocked; code falls back to search/public or skips.
- Rate limits: All requests are globally paced (601ms). Tune by editing `internal/crawler/ratelimit.go`.
- Double /api in URL: ensure `VITE_API_URL` has no trailing slash in `frontend/.env`.
- `/api/graph` looks empty: ensure precalc has run and `DETAILED_GRAPH` settings are set as expected. The API falls back to legacy JSON only when precalculated tables are empty.
- Precalc slow: adjust `GRAPH_NODE_BATCH_SIZE`, `GRAPH_LINK_BATCH_SIZE`, `GRAPH_PROGRESS_INTERVAL` and consider reducing `POSTS_PER_SUB_IN_GRAPH` or `COMMENTS_PER_POST_IN_GRAPH`.
- **Position columns errors** (`pos_x/pos_y/pos_z does not exist`): Run `make migrate-up` or `make migrate-up-local` to apply migration 000016. New databases created via docker-compose already include these columns in schema.sql. For existing databases, the migration is idempotent and safe to run multiple times.
