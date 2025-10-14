# Reddit Cluster Map — System Overview

This document explains the end-to-end data flow, components, and how they interconnect. Use this as your mental model before diving into code.

## High-level flow

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

## Data model

Key tables: subreddits, users, posts, comments, crawl_jobs, subreddit_relationships, user_subreddit_activity, graph_nodes, graph_links.

- graph*nodes: id (prefixes subreddit*, user*, post*, comment\_), name, val, type.
- graph_links: edges between nodes.

## Request rate limiting

All outbound Reddit HTTP calls are paced by a global 601ms ticker (≈1.66 rps). This includes:

- OAuth token requests
- OAuth API requests
- Public (non-auth) fallbacks

Retries honor Retry-After headers and also pass through the limiter.

## User subreddit discovery

- Primary: OAuth listing `/user/{name}/.json`.
- Fallbacks: OAuth search `author:{name}`, public `old.reddit.com` listing.
- If inaccessible (403/404/401), we skip gracefully (empty result) and continue.

## Graph precalculation

- Subreddit relationships by shared authors (co-occurrence across users).
- User activity counts per subreddit.
- Optional detailed content graph (posts/comments). Node `val` reflects score or counts when available.
- Links created:
  - subreddit↔subreddit (overlap)
  - user→subreddit (activity)
  - post→comment and comment→comment (reply chains)
  - user→post and user→comment (authorship)
- Performance: precalc batches node upserts and link inserts with configurable batch sizes and periodic progress logs.
  - Node batch size: `GRAPH_NODE_BATCH_SIZE` (default 1000)
  - Link batch size: `GRAPH_LINK_BATCH_SIZE` (default 2000)
  - Progress interval: `GRAPH_PROGRESS_INTERVAL` (default 10000)

## API surface

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

Notes:

- The API caches `/api/graph` responses for ~60s and caps by `max_nodes` and `max_links` query params.
- When `DETAILED_GRAPH=false`, only users and subreddits are emitted.
