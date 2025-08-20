# Reddit Cluster Map — System Overview

This document explains the end-to-end data flow, components, and how they interconnect. Use this as your mental model before diving into code.

## High-level Flow

- Input: Subreddit names are enqueued as crawl jobs.
- Crawler: Fetches subreddit info, posts, and comments via Reddit API (OAuth + rate-limited).
- Storage: Normalized into PostgreSQL tables (subreddits, users, posts, comments).
- Discovery: From fetched comments, extract authors and optionally enqueue related subreddits and mentioned subs.
- Precalculation: A graph service periodically turns relational data into nodes and links.
- API: Serves a consolidated graph JSON at `/api/graph`.
- Frontend: Loads the graph, lets users explore with filters and 3D visualization.

## Components

- backend/cmd/server: REST API server and graph job scheduler.
- backend/cmd/crawler: Worker that processes crawl jobs from DB.
- backend/cmd/precalculate: One-shot job to generate graph on demand.
- backend/internal/crawler: Reddit API client, job orchestration, parsing, discovery.
- backend/internal/graph: Graph precalc service; reads DB, writes graph tables.
- backend/internal/db: sqlc-generated data access layer.
- frontend: Vite/React app rendering the graph.

## Data Model

Key tables: subreddits, users, posts, comments, crawl_jobs, subreddit_relationships, user_subreddit_activity, graph_nodes, graph_links.

- graph*nodes: id (prefixes subreddit*, user*, post*, comment\_), name, val, type.
- graph_links: edges between nodes.

## Request Rate Limiting

All outbound Reddit HTTP calls are paced by a global 601ms ticker (≈1.66 rps). This includes:

- OAuth token requests
- OAuth API requests
- Public (non-auth) fallbacks

Retries honor Retry-After headers and also pass through the limiter.

## User Subreddit Discovery

- Primary: OAuth listing `/user/{name}/.json`.
- Fallbacks: OAuth search `author:{name}`, public `old.reddit.com` listing.
- If inaccessible (403/404/401), we skip gracefully (empty result) and continue.

## Graph Precalculation

- Subreddit relationships by shared authors.
- User activity counts per subreddit.
- Optional detailed content graph (posts/comments with per-node val set to score or counts).
- Links created: subreddit↔subreddit, user→subreddit, and optional user→post/comment and post/comment hierarchy.

## API Surface

- GET /api/graph: consolidated graph JSON for frontend.
- POST /api/crawl: enqueue a subreddit crawl.
- Aux endpoints: /subreddits, /users, /posts, /comments, /jobs.

## Frontend

- Fetches graph from `${VITE_API_URL || '/api'}/graph`.
- Filters nodes by type; adjusts visuals via controls.

## Deployment

- backend/docker-compose.yml defines services: api, crawler, db, precalculate, reddit_frontend.
- Frontend nginx proxies `/api/` → `api:8000/api/`.
- Backend server listens on :8000; Dockerfile EXPOSE 8000.
