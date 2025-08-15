-- name: EnqueueCrawlJob :exec
INSERT INTO crawl_jobs (subreddit_id, status, retries, enqueued_by)
VALUES ($1, 'queued', 0, $2)
ON CONFLICT (subreddit_id) DO NOTHING;

-- name: GetNextCrawlJob :one
SELECT * FROM crawl_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1;

-- name: MarkCrawlJobStarted :exec
UPDATE crawl_jobs SET status = 'crawling', last_attempt = now(), updated_at = now() WHERE id = $1;

-- name: MarkCrawlJobSuccess :exec
UPDATE crawl_jobs SET status = 'success', updated_at = now() WHERE id = $1;

-- name: MarkCrawlJobFailed :exec
UPDATE crawl_jobs SET status = 'failed', retries = retries + 1, updated_at = now() WHERE id = $1;

-- name: ListCrawlJobs :many
SELECT * FROM crawl_jobs ORDER BY created_at DESC LIMIT $1 OFFSET $2;

-- name: NextCrawlJob :one
SELECT * FROM crawl_jobs
WHERE status = 'pending'
ORDER BY created_at
LIMIT 1
FOR UPDATE SKIP LOCKED;

SELECT * FROM crawl_jobs
WHERE status = 'queued' OR status = 'crawling'
ORDER BY created_at ASC
LIMIT $1;

UPDATE crawl_jobs
SET status = 'crawling'
WHERE id = $1;

SELECT EXISTS (
  SELECT 1 FROM crawl_jobs WHERE subreddit_id = $1 AND status IN ('queued', 'crawling')
) AS exists;
