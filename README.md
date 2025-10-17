# Reddit Cluster Map

[![CI](https://github.com/onnwee/reddit-cluster-map/actions/workflows/ci.yml/badge.svg)](https://github.com/onnwee/reddit-cluster-map/actions/workflows/ci.yml)

Collect, analyze, and visualize relationships between Reddit communities and users as an interactive 3D network graph.

---

## 🧠 What it does

- Crawls subreddits for posts and comments (OAuth-authenticated; globally rate limited).
- Stores normalized data in PostgreSQL.
- Precomputes a graph (nodes + links) based on shared participation and activity, with an optional detailed content graph (posts/comments).
- Serves the graph at `/api/graph` for the React frontend to render in multiple visualization modes:
  - **3D Graph**: Interactive WebGL visualization
  - **2D Graph**: SVG-based force-directed layout with drag & pan
  - **Dashboard**: Statistical overview and analytics
  - **Communities**: Automated community detection using the Louvain algorithm

---

## 🧱 Architecture

- Backend (Go)
  - API server: `backend/cmd/server`
  - Crawler: `backend/cmd/crawler`
  - Precalculation: `backend/cmd/precalculate`
  - Data access via sqlc: SQL in `backend/internal/queries/*.sql` → generated in `backend/internal/db`
- Database: PostgreSQL
- Frontend (Vite + React 3D): `frontend/` (graph viewer)

See `docs/overview.md` for the full system picture and data flow.

---

## 🚀 Quick start

For full setup (Docker, env vars, seeding a crawl), see `docs/setup.md`.
For CI/CD pipeline and Docker image publishing, see `docs/CI-CD.md`.

Common dev tasks from `backend/`:

- Regenerate sqlc after editing SQL in `backend/internal/queries/*.sql`:
  - `make sqlc` (alias: `make generate`)
- Run the one-shot graph precalc:
  - `make precalculate`
- Run tests:
  - `go test ./...`

---

## 🔌 API surface

- `GET /api/graph?max_nodes=20000&max_links=50000`
  - Returns `{ nodes, links }`. Results are cached for ~60s and capped by max_nodes/max_links using a stable weighting.
  - Prefers precalculated tables, falls back to legacy JSON when empty.
- `POST /api/crawl { "subreddit": "AskReddit" }`
- Additional resource endpoints exist without `/api` prefix: `/subreddits`, `/users`, `/posts`, `/comments`, `/jobs`.

See `docs/api.md` for details.

---

## ⚙️ Configuration

Key environment variables (selected):

- Reddit OAuth
  - `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_REDIRECT_URI`, `REDDIT_SCOPES`, `REDDIT_USER_AGENT`
- HTTP / retries
  - `HTTP_MAX_RETRIES` (default 3), `HTTP_RETRY_BASE_MS` (300), `HTTP_TIMEOUT_MS` (15000), `LOG_HTTP_RETRIES` (false)
- Graph generation
  - `DETAILED_GRAPH` (false) — include posts/comments
  - `POSTS_PER_SUB_IN_GRAPH` (10), `COMMENTS_PER_POST_IN_GRAPH` (50)
  - `MAX_AUTHOR_CONTENT_LINKS` (3) — cross-link content by the same author across subreddits
  - `DISABLE_API_GRAPH_JOB` (false) — disable hourly background job in API
  - `PRECALC_CLEAR_ON_START` (false) — when true, clears graph tables at precalc start
  - Batching/progress (applied at runtime in precalc):
    - `GRAPH_NODE_BATCH_SIZE` (1000)
    - `GRAPH_LINK_BATCH_SIZE` (2000)
    - `GRAPH_PROGRESS_INTERVAL` (10000)
- Crawler scheduling
  - `STALE_DAYS` (30), `RESET_CRAWLING_AFTER_MIN` (15)

---

## 🖥 Frontend

- Vite + React with multiple visualization modes:
  - 3D graph with `react-force-graph-3d`
  - 2D graph with D3.js force simulation
  - Statistics dashboard
  - **Community detection** view with Louvain algorithm
- `VITE_API_URL` defaults to `/api`
- Optional client caps: `VITE_MAX_RENDER_NODES`, `VITE_MAX_RENDER_LINKS`

See `docs/visualization-modes.md` and `docs/community-detection.md` for feature details.
See `frontend/README.md` for local dev and env hints.
