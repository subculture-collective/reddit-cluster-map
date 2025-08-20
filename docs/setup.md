# Setup and Quickstart

This guide gets you from zero to a running stack.

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local frontend builds)
- Go 1.21+ (optional for local backend builds)

## Clone and Configure

1. Clone the repo.
2. Backend env: copy `backend/.env.example` to `backend/.env` and fill:

```
REDDIT_CLIENT_ID=<from reddit app>
REDDIT_CLIENT_SECRET=<from reddit app>
REDDIT_USER_AGENT=reddit-cluster-map/0.1 (+your_contact)
POSTGRES_PASSWORD=<choose strong password>
DATABASE_URL=postgres://postgres:${POSTGRES_PASSWORD}@db:5432/reddit_cluster?sslmode=disable
```

3. Frontend env: set `frontend/.env`:

```
VITE_API_URL=/api
```

## Start Services

From `backend/`:

- Start DB, API, crawler, frontend:
  - `docker compose up -d --build`
- Initialize schema (if not auto-applied):
  - `docker compose exec -T db psql -U postgres -d reddit_cluster -f /docker-entrypoint-initdb.d/01_schema.sql`

The API listens on port 8000 inside the network. Frontend serves on port 80 (container) behind your reverse proxy.

## Seed a Crawl

- POST to enqueue a subreddit:

```
curl -X POST https://<your-domain>/api/crawl -H 'Content-Type: application/json' -d '{"subreddit":"AskReddit"}'
```

Crawler will pull posts/comments and populate the DB.

## Generate Graph Now

- Run the precalculate container once:
  - `docker compose run --rm precalculate /app/precalculate`

Or wait for the API server’s graph job (every hour) to update automatically.

## Frontend Access

- Open your domain. The app fetches `/api/graph` via nginx.

## Local Dev (optional)

- Backend tests: `go test ./...`
- Frontend dev: from `frontend/`, `npm ci && npm run dev` (proxy to `localhost:8000` is configured in `vite.config.ts`).

## Troubleshooting

- 403 on user listings: app-only OAuth may be blocked; code falls back to search/public or skips.
- Rate limits: All requests are globally paced (601ms). Tune by editing `internal/crawler/ratelimit.go`.
- Double /api in URL: ensure `VITE_API_URL` has no trailing slash in `frontend/.env`.
