# API Reference

## Base URLs

## Endpoints

### GET /api/graph

Returns a pre-aggregated graph JSON: `{ nodes: [...], links: [...] }`.

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

```

### GET /api/admin/backups

List available database backup files (read-only).

Response JSON: [ { "name": string, "size": number, "modified": RFC3339 string } ]

Notes:
- Only files named like `reddit_cluster_YYYYMMDD_HHMMSS.sql` are returned.
- Results are sorted by name (timestamp ascending).

### GET /api/admin/backups/{name}

Download a specific backup file by name.

Path parameter:
- name: Must match `reddit_cluster_*.sql` and refer to an existing file.

Response: 200 OK with application/sql attachment. 404 if not found.
```
