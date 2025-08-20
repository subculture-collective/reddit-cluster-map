DROP INDEX IF EXISTS idx_crawl_jobs_priority;
ALTER TABLE crawl_jobs DROP COLUMN IF EXISTS priority;
