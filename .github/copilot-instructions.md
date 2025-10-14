# Copilot instructions for reddit-cluster-map

## Big picture

- Goal: crawl Reddit, store normalized data (Postgres), precalculate a graph, and serve it to a 3D React UI.
- Components (paths):
  - API server (Go): `backend/internal/api`, entry `backend/cmd/server/main.go`
  - Crawler (Go): `backend/internal/crawler`, entry `backend/cmd/crawler/main.go`
  - Graph precalculation (Go): `backend/internal/graph`, entry `backend/cmd/precalculate/main.go`
  - Data access via sqlc: SQL in `backend/internal/queries/*.sql` → generated in `backend/internal/db`
  - Frontend (Vite+React 3D): `frontend/` (graph viewer)

## Data flow and conventions

- Crawl jobs are enqueued via `POST /api/crawl` and processed by the crawler (OAuth+rate-limited HTTP).
- Precalculation writes to `graph_nodes` and `graph_links` (see `backend/internal/graph/service.go`).
  - Node IDs are prefixed: `user_<id>`, `subreddit_<id>`, `post_<id>`, `comment_<id>`.
  - Links follow those IDs (e.g., user→subreddit, subreddit↔subreddit, post/comment hierarchy).
  - Detailed content graph is gated by env `DETAILED_GRAPH=true` and related limits (see `backend/internal/config/config.go`).
- The API `GET /api/graph` prefers precalculated tables and falls back to legacy JSON if empty (`backend/internal/api/handlers/graph.go`).
  - Server caps result size via `max_nodes` and `max_links` query params and caches responses for 60s.
  - Weighting for caps uses `max(Val, degree)`; keep this consistent if you change `GraphResponse`.

## API surface (frontend relies on these)

- `GET /api/graph?max_nodes=20000&max_links=50000` → `{ nodes, links }` shape in `frontend/src/types/graph.ts`.
- `POST /api/crawl {"subreddit":"AskReddit"}` → seeds/queues crawl (see `backend/internal/api/handlers/crawl.go`).
- Additional resource endpoints exist without `/api` prefix (e.g., `/subreddits`, `/users`, `/posts`, `/comments`, `/jobs`) in `backend/internal/api/routes.go`.

## Project-specific patterns

- Rate limiting for all Reddit calls is a single global ticker at ~1.66 rps (601ms) in `backend/internal/crawler/ratelimit.go`.
- HTTP retries respect `Retry-After` and exponential backoff (`backend/internal/httpx/httpx.go`); config via env (see `config.Load()`).
- Config is memoized; call `config.ResetForTest()` in tests that modify env.
- sqlc: Edit SQL in `backend/internal/queries/*.sql` and regenerate with `make sqlc` (alias `make generate`).

## Dev workflows

- Docker (recommended): from `backend/` run `docker compose up -d --build` to bring up db, api, crawler, frontend.
- Migrations: use `make migrate-up` (or `make migrate-up-local`), base schema is also mounted in compose.
- Precalc: service runs hourly; on-demand: `make precalculate` (runs `/app/precalculate`).
- Tests: `go test ./...` (integration tests under `backend/internal/graph`), frontend dev from `frontend/`: `npm ci && npm run dev`.

## Frontend integration

- Fetches from `${VITE_API_URL || '/api'}/graph` and renders with `react-force-graph-3d` (`frontend/src/components/Graph3D.tsx`).
- Client honors caps via request params and may set `VITE_MAX_RENDER_NODES`/`VITE_MAX_RENDER_LINKS`.
- Node colors by type; UI exposes filters and physics controls; keep backend node `type` stable.

## When adding/changing features

- New endpoints: register in `backend/internal/api/routes.go` and return JSON with explicit shapes; prefer existing `db.Queries` methods or add SQL in `internal/queries` and regenerate.
- Graph changes: honor ID prefix scheme and capping logic; ensure precalc writes consistent `val` (numeric as text) and `type`.
- Crawler changes: pass through the global limiter and `httpx` retry helpers; avoid tight loops.
