-- name: EnqueueCrawlJob :exec
INSERT INTO crawl_jobs (subreddit_id, status, retries, enqueued_by)
SELECT $1, 'queued', 0, $2
WHERE NOT EXISTS (SELECT 1 FROM crawl_jobs WHERE subreddit_id = $1);

-- name: MarkCrawlJobStarted :exec
UPDATE crawl_jobs SET status = 'crawling', last_attempt = now(), updated_at = now() WHERE id = $1;

-- name: MarkCrawlJobSuccess :exec
UPDATE crawl_jobs SET status = 'success', updated_at = now() WHERE id = $1;

-- name: MarkCrawlJobFailed :exec
UPDATE crawl_jobs SET status = 'failed', retries = retries + 1, updated_at = now() WHERE id = $1;

-- name: ListCrawlJobs :many
SELECT
  id,
  subreddit_id,
  status,
  retries,
  priority,
  last_attempt,
  enqueued_by,
  created_at,
  updated_at
FROM crawl_jobs
ORDER BY created_at DESC
LIMIT $1::int OFFSET $2::int;

-- name: ListQueueWithNames :many
SELECT cj.id, cj.subreddit_id, s.name AS subreddit_name, cj.status, cj.priority, cj.created_at, cj.updated_at
FROM crawl_jobs cj
JOIN subreddits s ON s.id = cj.subreddit_id
WHERE cj.status IN ('queued','crawling')
ORDER BY cj.priority DESC, cj.created_at ASC;

-- name: CrawlJobExists :one
SELECT EXISTS (
	SELECT 1
	FROM crawl_jobs
	WHERE subreddit_id = $1
);

-- name: ClaimNextJobWithTimeout :one
SELECT id, subreddit_id, status, retries, priority, last_attempt, duration_ms, enqueued_by, created_at, updated_at
FROM crawl_jobs
WHERE status = 'queued' AND visible_at <= now()
ORDER BY priority DESC, created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;

-- name: UpdateJobVisibilityTimeout :exec
UPDATE crawl_jobs 
SET visible_at = $2, updated_at = now() 
WHERE id = $1;

-- name: MarkJobFailedWithRetry :exec
UPDATE crawl_jobs 
SET status = 'failed',
    retry_count = retry_count + 1,
    next_retry_at = $2,
    updated_at = now()
WHERE id = $1;

-- name: RequeueRetryableJobs :exec
UPDATE crawl_jobs
SET status = 'queued',
    visible_at = now(),
    updated_at = now()
WHERE status = 'failed' 
  AND next_retry_at IS NOT NULL 
  AND next_retry_at <= now()
  AND retry_count < max_retries;

-- name: AgeStarvedJobs :exec
UPDATE crawl_jobs
SET priority = priority + $2,
    updated_at = now()
WHERE status = 'queued'
  AND created_at < now() - $1::interval
  AND priority < 100;

