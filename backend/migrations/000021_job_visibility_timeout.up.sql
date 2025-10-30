-- Add visibility timeout and retry fields for better job queue management
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS visible_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3;
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- Index for efficient queries of jobs that are visible and ready to process
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_visible_at ON crawl_jobs(visible_at) WHERE status = 'queued';

-- Index for finding jobs ready to retry
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_next_retry ON crawl_jobs(next_retry_at) WHERE status = 'failed' AND next_retry_at IS NOT NULL;

COMMENT ON COLUMN crawl_jobs.visible_at IS 'Timestamp when the job becomes visible/available for processing';
COMMENT ON COLUMN crawl_jobs.retry_count IS 'Number of times this job has been retried';
COMMENT ON COLUMN crawl_jobs.max_retries IS 'Maximum number of retries before giving up';
COMMENT ON COLUMN crawl_jobs.next_retry_at IS 'Timestamp for next retry attempt (if failed)';
