-- Revert visibility timeout and retry fields
DROP INDEX IF EXISTS idx_crawl_jobs_next_retry;
DROP INDEX IF EXISTS idx_crawl_jobs_visible_at;

ALTER TABLE crawl_jobs DROP COLUMN IF EXISTS next_retry_at;
ALTER TABLE crawl_jobs DROP COLUMN IF EXISTS max_retries;
ALTER TABLE crawl_jobs DROP COLUMN IF EXISTS retry_count;
ALTER TABLE crawl_jobs DROP COLUMN IF EXISTS visible_at;
