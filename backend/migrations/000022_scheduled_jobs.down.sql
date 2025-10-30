-- Revert scheduled_jobs table
DROP INDEX IF EXISTS idx_scheduled_jobs_subreddit;
DROP INDEX IF EXISTS idx_scheduled_jobs_next_run;
DROP TABLE IF EXISTS scheduled_jobs;
