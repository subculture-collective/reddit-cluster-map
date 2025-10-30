-- name: CreateScheduledJob :one
INSERT INTO scheduled_jobs (
    name, 
    description, 
    subreddit_id, 
    cron_expression, 
    enabled, 
    next_run_at, 
    priority,
    created_by
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, name, description, subreddit_id, cron_expression, enabled, last_run_at, next_run_at, priority, created_at, updated_at, created_by;

-- name: GetScheduledJob :one
SELECT id, name, description, subreddit_id, cron_expression, enabled, last_run_at, next_run_at, priority, created_at, updated_at, created_by
FROM scheduled_jobs
WHERE id = $1;

-- name: ListScheduledJobs :many
SELECT id, name, description, subreddit_id, cron_expression, enabled, last_run_at, next_run_at, priority, created_at, updated_at, created_by
FROM scheduled_jobs
ORDER BY next_run_at ASC
LIMIT $1::int OFFSET $2::int;

-- name: ListDueScheduledJobs :many
SELECT id, name, description, subreddit_id, cron_expression, enabled, last_run_at, next_run_at, priority, created_at, updated_at, created_by
FROM scheduled_jobs
WHERE enabled = true AND next_run_at <= now()
ORDER BY priority DESC, next_run_at ASC;

-- name: UpdateScheduledJob :exec
UPDATE scheduled_jobs
SET name = $2,
    description = $3,
    cron_expression = $4,
    enabled = $5,
    next_run_at = $6,
    priority = $7,
    updated_at = now()
WHERE id = $1;

-- name: UpdateScheduledJobLastRun :exec
UPDATE scheduled_jobs
SET last_run_at = $2,
    next_run_at = $3,
    updated_at = now()
WHERE id = $1;

-- name: DeleteScheduledJob :exec
DELETE FROM scheduled_jobs WHERE id = $1;

-- name: ToggleScheduledJob :exec
UPDATE scheduled_jobs
SET enabled = $2,
    updated_at = now()
WHERE id = $1;
