-- Create scheduled_jobs table for cron-like recurring crawl jobs
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    subreddit_id INTEGER REFERENCES subreddits(id),
    cron_expression TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL,
    priority INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT,
    CONSTRAINT valid_cron_format CHECK (cron_expression ~ '^(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(@every (\d+(ns|us|µs|ms|s|m|h))+)|((((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*) ?){5,7})$')
);

-- Index for finding jobs that need to run
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at) WHERE enabled = true;

-- Index for lookups by subreddit
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_subreddit ON scheduled_jobs(subreddit_id) WHERE enabled = true;

COMMENT ON TABLE scheduled_jobs IS 'Scheduled recurring crawl jobs with cron-like scheduling';
COMMENT ON COLUMN scheduled_jobs.cron_expression IS 'Cron expression (standard 5-7 field format) or @every duration';
COMMENT ON COLUMN scheduled_jobs.next_run_at IS 'Next scheduled execution time';
COMMENT ON COLUMN scheduled_jobs.last_run_at IS 'Last execution time';
