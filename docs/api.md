# API reference

## Base URL

- Public routes are served by the API container (Docker default: `http://api:8000`).
- When served behind nginx (frontend), requests go to `/api/*`.

## Endpoints

### GET /api/graph

Returns the consolidated graph JSON:

```
{ "nodes": Node[], "links": Link[] }
```

Notes:

Query params:

    - Optional: `types=subreddit,user,post,comment` to filter node types
    - Optional: `with_positions=true` to include precomputed positions (when available) as `x,y,z` on nodes

### POST /api/crawl

Enqueue a subreddit crawl job.

Request body:
{ "id": "subreddit_123", "name": "AskReddit", "val": 123456, "type": "subreddit", "x": 12.3, "y": -4.5, "z": 78.9 }

```
{ "subreddit": "AskReddit" }
```

Response: `202 Accepted` on success.

### GET /subreddits

List subreddits.

Query params: `limit`, `offset`.

### GET /users

List users with pagination.

Query params: `limit`, `offset`.

### GET /posts

List posts by subreddit.

Query params: `subreddit_id`, `limit`, `offset`.

### GET /comments

List comments by post.

Query params: `post_id`.

### GET /jobs

List crawl jobs with pagination.

Query params: `limit`, `offset`.

### Admin backups

Requires `ADMIN_APITOKEN` if configured by the server.

#### GET /api/admin/backups

List available database backup files (read-only).

Response JSON:

```
[{ "name": string, "size": number, "modified": RFC3339 string }]
```

Notes:

- Only files named like `reddit_cluster_YYYYMMDD_HHMMSS.sql` are returned.
- Results are sorted by name (timestamp ascending).

#### GET /api/admin/backups/{name}

Download a specific backup file by name.

Path parameter:

- `name`: Must match `reddit_cluster_*.sql` and refer to an existing file.

Response: `200 OK` with `application/sql` attachment. `404` if not found.
