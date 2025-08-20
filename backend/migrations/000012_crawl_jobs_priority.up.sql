ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_priority ON crawl_jobs(priority);
