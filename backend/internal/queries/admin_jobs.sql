-- name: UpdateCrawlJobStatus :exec
UPDATE crawl_jobs 
SET status = $2, updated_at = now() 
WHERE id = $1;

-- name: UpdateCrawlJobPriority :exec
UPDATE crawl_jobs 
SET priority = $2, updated_at = now() 
WHERE id = $1;

-- name: RetryCrawlJob :exec
UPDATE crawl_jobs 
SET status = 'queued', retries = 0, updated_at = now() 
WHERE id = $1;

-- name: GetCrawlJobByID :one
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
WHERE id = $1;

-- name: ListCrawlJobsByStatus :many
SELECT
  cj.id,
  cj.subreddit_id,
  s.name AS subreddit_name,
  cj.status,
  cj.retries,
  cj.priority,
  cj.last_attempt,
  cj.enqueued_by,
  cj.created_at,
  cj.updated_at
FROM crawl_jobs cj
JOIN subreddits s ON s.id = cj.subreddit_id
WHERE cj.status = $1
ORDER BY cj.priority DESC, cj.created_at DESC
LIMIT $2::int OFFSET $3::int;

-- name: GetAdminCrawlJobStats :one
SELECT
  COUNT(*) FILTER (WHERE status = 'queued') AS queued_count,
  COUNT(*) FILTER (WHERE status = 'crawling') AS running_count,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
  COUNT(*) FILTER (WHERE status = 'success') AS completed_count,
  COUNT(*) AS total_count
FROM crawl_jobs;

-- name: LogAdminAction :exec
INSERT INTO admin_audit_log (action, resource_type, resource_id, user_id, details, ip_address)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: ListAdminAuditLog :many
SELECT
  id,
  action,
  resource_type,
  resource_id,
  user_id,
  details,
  ip_address,
  created_at
FROM admin_audit_log
ORDER BY created_at DESC
LIMIT $1::int OFFSET $2::int;

-- name: GetAllServiceSettings :many
SELECT key, value FROM service_settings ORDER BY key;
