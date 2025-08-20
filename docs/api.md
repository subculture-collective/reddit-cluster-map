# API Reference

## Base URLs

- Public frontend hits `/api/*` via nginx (proxy to backend `api:8000/api/`).

## Endpoints

### GET /api/graph

Returns a pre-aggregated graph JSON: `{ nodes: [...], links: [...] }`.

- Node shape: `{ id: string, name: string, val?: number|string, type?: 'subreddit'|'user'|'post'|'comment' }`
- Link shape: `{ source: string, target: string }`

### POST /api/crawl

Enqueue a subreddit crawl job.

Request body:

```
{ "subreddit": "AskReddit" }
```

Response: `202 Accepted` on success.

### GET /subreddits

List subreddits with pagination.

Query params: `limit`, `offset`.

### GET /users

List users with pagination.

### GET /posts

List posts by subreddit.

Query params: `subreddit_id`, `limit`, `offset`.

### GET /comments

List comments by post.

Query params: `post_id`.

### GET /jobs

List crawl jobs with pagination.
