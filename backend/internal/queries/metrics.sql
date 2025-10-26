-- name: CountNodesByType :one
SELECT COUNT(*) FROM graph_nodes WHERE type = $1;

-- name: CountGraphLinks :one
SELECT COUNT(*) FROM graph_links;

-- name: CountCommunities :one
SELECT COUNT(DISTINCT community_id) FROM user_subreddit_activity WHERE community_id IS NOT NULL;

-- name: GetCrawlJobStats :one
SELECT 
    COUNT(*) FILTER (WHERE status = 'pending') as pending_jobs,
    COUNT(*) FILTER (WHERE status = 'processing') as processing_jobs,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs
FROM crawl_jobs;

-- name: GetDatabaseStats :one
SELECT
    (SELECT COUNT(*) FROM subreddits) as subreddit_count,
    (SELECT COUNT(*) FROM users) as user_count,
    (SELECT COUNT(*) FROM posts) as post_count,
    (SELECT COUNT(*) FROM comments) as comment_count;
