-- name: EnqueueCrawlJob :exec
INSERT INTO crawl_jobs (subreddit, status, created_at, updated_at)
VALUES ($1, 'queued', now(), now())
ON CONFLICT (subreddit) DO NOTHING;

-- name: GetNextCrawlJob :one
SELECT * FROM crawl_jobs
WHERE status = 'queued'
ORDER BY created_at ASC
LIMIT 1;

-- name: MarkCrawlJobStarted :exec
UPDATE crawl_jobs SET status = 'crawling', last_attempt = now(), updated_at = now()
WHERE id = $1;

-- name: MarkCrawlJobSuccess :exec
UPDATE crawl_jobs SET status = 'success', updated_at = now()
WHERE id = $1;

-- name: MarkCrawlJobFailed :exec
UPDATE crawl_jobs SET status = 'failed', retries = retries + 1, updated_at = now()
WHERE id = $1;

-- name: ListCrawlJobs :many
SELECT * FROM crawl_jobs ORDER BY created_at DESC LIMIT 100;

-- name: NextCrawlJob :one
SELECT * FROM crawl_jobs
WHERE status = 'pending'
ORDER BY created_at
LIMIT 1
FOR UPDATE SKIP LOCKED;

-- name: GetPendingCrawlJobs :many
SELECT * FROM crawl_jobs
WHERE status = 'queued' OR status = 'in_progress'
ORDER BY created_at ASC
LIMIT $1;

-- name: MarkCrawlJobInProgress :exec
UPDATE crawl_jobs
SET status = 'in_progress'
WHERE id = $1;

-- name: CrawlJobExists :one
SELECT EXISTS (
  SELECT 1 FROM crawl_jobs WHERE subreddit = $1 AND status IN ('queued', 'in_progress')
) AS exists;
