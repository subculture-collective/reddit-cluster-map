package scheduler

import (
"context"
"database/sql"
"log"
"time"

"github.com/onnwee/reddit-cluster-map/backend/internal/db"
"github.com/onnwee/reddit-cluster-map/backend/internal/logger"
)

// Service manages scheduled crawl jobs
type Service struct {
queries *db.Queries
stop    chan struct{}
}

// NewService creates a new scheduler service
func NewService(q *db.Queries) *Service {
return &Service{
queries: q,
stop:    make(chan struct{}),
}
}

// Start begins the scheduler loop
func (s *Service) Start(ctx context.Context) {
log.Println("🕐 Starting scheduler service...")
ticker := time.NewTicker(1 * time.Minute)
defer ticker.Stop()

// Run immediately on start
s.processScheduledJobs(ctx)

for {
select {
case <-ctx.Done():
log.Println("🛑 Scheduler stopped by context")
return
case <-s.stop:
log.Println("🛑 Scheduler stopped by signal")
return
case <-ticker.C:
s.processScheduledJobs(ctx)
}
}
}

// Stop gracefully stops the scheduler
func (s *Service) Stop() {
close(s.stop)
}

// processScheduledJobs finds and processes all due scheduled jobs
func (s *Service) processScheduledJobs(ctx context.Context) {
jobs, err := s.queries.ListDueScheduledJobs(ctx)
if err != nil {
logger.ErrorContext(ctx, "Failed to list due scheduled jobs", "error", err)
return
}

if len(jobs) == 0 {
return
}

logger.InfoContext(ctx, "Processing scheduled jobs", "count", len(jobs))

for _, job := range jobs {
if err := s.executeScheduledJob(ctx, job); err != nil {
logger.ErrorContext(ctx, "Failed to execute scheduled job",
"job_id", job.ID,
"name", job.Name,
"error", err)
}
}
}

// executeScheduledJob executes a single scheduled job
func (s *Service) executeScheduledJob(ctx context.Context, job db.ScheduledJob) error {
logger.InfoContext(ctx, "Executing scheduled job",
"job_id", job.ID,
"name", job.Name,
"subreddit_id", job.SubredditID)

// Enqueue a crawl job with the specified priority
if job.SubredditID.Valid {
err := s.queries.EnqueueCrawlJob(ctx, db.EnqueueCrawlJobParams{
SubredditID: job.SubredditID.Int32,
EnqueuedBy:  sql.NullString{String: "scheduler:" + job.Name, Valid: true},
})
if err != nil {
return err
}

// If priority is set, update the job priority
if job.Priority.Valid && job.Priority.Int32 > 0 {
err = s.queries.UpdateCrawlJobPriority(ctx, db.UpdateCrawlJobPriorityParams{
ID:       job.SubredditID.Int32,
Priority: job.Priority,
})
if err != nil {
logger.WarnContext(ctx, "Failed to set priority for scheduled job", "error", err)
}
}
}

// Calculate next run time
nextRun, err := ParseCronExpression(job.CronExpression, time.Now())
if err != nil {
logger.ErrorContext(ctx, "Failed to parse cron expression",
"job_id", job.ID,
"cron", job.CronExpression,
"error", err)
// Don't update if we can't parse - this prevents the job from running repeatedly
return err
}

// Update last_run_at and next_run_at
err = s.queries.UpdateScheduledJobLastRun(ctx, db.UpdateScheduledJobLastRunParams{
ID: job.ID,
LastRunAt: sql.NullTime{
Time:  time.Now(),
Valid: true,
},
NextRunAt: nextRun,
})
if err != nil {
return err
}

logger.InfoContext(ctx, "Scheduled job executed successfully",
"job_id", job.ID,
"name", job.Name,
"next_run", nextRun.Format(time.RFC3339))

return nil
}
