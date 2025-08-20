# Reddit Network Cluster Map

A full-stack application for collecting, analyzing, and visualizing Reddit communities and their user interactions as network graphs.

---

## 🧠 Project Goals

- Collect Reddit posts, comments, and user activity
- Store and normalize this data in a queryable format
- Analyze community connections, shared participation, and behavior patterns
- Visualize relationships and clusters as an interactive graph

---

## 🧱 Stack Overview

### 🖥 Frontend

- **React** — Component-based UI
- **Tailwind CSS** — Utility-first styling
- **D3.js** or **Cytoscape.js** — For interactive graph rendering and data-driven layouts (TBD)

### 🗃 Backend

- **Go** — REST API and data processing
- **PostgreSQL** — Persistent storage
- **sqlc** — Compile-time query generation
- **Prometheus + Grafana** — Monitoring and observability

# Reddit Cluster Map

Collect, analyze, and visualize relationships between Reddit communities and users as an interactive network graph.

## Docs

- System overview: docs/overview.md
- Setup & quickstart: docs/setup.md
- API reference: docs/api.md

## What it does

- Crawls subreddits for posts and comments (paced and OAuth-authenticated).
- Stores normalized data in Postgres.
- Precomputes a graph (nodes + links) based on shared participation and activity.
- Serves the graph at `/api/graph` for the React frontend to render in 3D.

## Services

- API server (Go): REST endpoints and scheduled graph job.
- Crawler (Go): processes crawl jobs and discovers related subs.
- Database (Postgres): primary storage.
- Frontend (React+Vite): interactive graph UI, proxied via nginx.

## Quick start

See docs/setup.md for environment variables, Docker compose, and seeding your first crawl.
/backend

### Backend dev tips

- Regenerate sqlc code after editing SQL in `backend/internal/queries/*.sql`:
  - From `backend/`: `make sqlc` (alias: `make generate`)
- Configure Reddit OAuth in `backend/.env` (see `backend/.env.example`):
  - REDDIT_APP_NAME=cluster-map
  - REDDIT_APP_TYPE=personal use script
  - REDDIT_CLIENT_ID=XDdO0bzRuPAn3UfpUW7yXg
  - REDDIT_CLIENT_SECRET=…
  - REDDIT_REDIRECT_URI=https://reddit-cluster-map.onnwee.me/oauth/reddit/callback
  - REDDIT_SCOPES="identity read"
