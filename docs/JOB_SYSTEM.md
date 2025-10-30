# Job System Documentation

## Overview

The reddit-cluster-map crawler uses an advanced job queue system with prioritization, automatic retries, and scheduled jobs to efficiently manage crawl operations.

## Features

### 1. Priority Queue

Jobs are processed based on priority, with higher priority jobs being executed first.

- **Default Priority**: 0
- **Maximum Priority**: 100
- **Priority Ordering**: Jobs are selected by `priority DESC, created_at ASC`

#### Automatic Priority Aging

Jobs that have been waiting for a long time automatically receive priority boosts to prevent starvation:

- Runs every 5 minutes
- Jobs older than 1 hour receive +10 priority boost
- Priority is capped at 100
- Ensures long-waiting jobs eventually get processed

### 2. Deduplication

The system prevents duplicate crawl jobs for the same subreddit:

- `UNIQUE` constraint on `subreddit_id` in `crawl_jobs` table
- Attempting to enqueue a duplicate job is silently ignored
- Ensures each subreddit has at most one pending job

### 3. Visibility Timeout & Retry with Jitter

Failed jobs are automatically retried with exponential backoff and jitter:

#### Retry Mechanism

- **Retry Delay Formula**: `1 minute × 2^retry_count`
- **Maximum Delay**: 24 hours
- **Jitter**: ±20% random variation to prevent thundering herd
- **Maximum Retries**: Configurable per job (default: 3)

#### Example Retry Schedule

| Retry # | Base Delay | Actual Delay (with jitter) |
|---------|------------|----------------------------|
| 1       | 1m         | 48s - 72s                  |
| 2       | 2m         | 96s - 144s                 |
| 3       | 4m         | 192s - 288s                |
| 4       | 8m         | 384s - 576s                |
| 5       | 16m        | 768s - 1152s               |
| ...     | ...        | ...                        |
| 20+     | 24h        | 19.2h - 28.8h              |

#### Visibility Timeout

Jobs in the "queued" state have a `visible_at` timestamp:

- Only jobs with `visible_at <= now()` can be claimed
- Failed jobs are made invisible until their retry time
- Prevents workers from processing jobs that aren't ready

### 4. Scheduled Jobs (Cron-like)

Scheduled jobs enable recurring crawls at specified intervals:

#### Supported Cron Expressions

**Named Expressions:**
- `@yearly` or `@annually` - Run once a year (Jan 1, midnight)
- `@monthly` - Run once a month (1st day, midnight)
- `@weekly` - Run once a week (Sunday, midnight)
- `@daily` - Run once a day (midnight)
- `@hourly` - Run once an hour

**Duration Expressions:**
- `@every <duration>` - Run at fixed intervals
  - Examples: `@every 1h`, `@every 30m`, `@every 7d`
  - Supported units: `ns`, `us`, `µs`, `ms`, `s`, `m`, `h`, `d`

#### Scheduled Job Properties

- **name**: Unique identifier for the scheduled job
- **description**: Human-readable description
- **subreddit_id**: Target subreddit to crawl
- **cron_expression**: Scheduling pattern
- **enabled**: Boolean to enable/disable the job
- **priority**: Priority for enqueued crawl jobs
- **next_run_at**: Calculated next execution time
- **last_run_at**: Timestamp of last execution

### 5. Job Lifecycle

```
┌─────────┐
│ queued  │ ← Initial state
└────┬────┘
     │
     ↓ (worker claims job)
┌──────────┐
│ crawling │
└────┬─────┘
     │
     ├─→ success ─→ [complete]
     │
     └─→ failed ──→ retry_count < max_retries?
                    │
                    ├─→ yes: back to queued (with visibility timeout)
                    └─→ no: stays failed
```

## Admin API Endpoints

### Job Management

#### Get Job Statistics
```
GET /api/admin/jobs/stats
```

Returns counts of jobs by status (queued, running, failed, completed).

#### List Jobs by Status
```
GET /api/admin/jobs?status=<status>&limit=100&offset=0
```

Parameters:
- `status`: Filter by status (queued, crawling, success, failed)
- `limit`: Number of results (default: 100)
- `offset`: Pagination offset (default: 0)

#### Update Job Status
```
PUT /api/admin/jobs/{id}/status
Content-Type: application/json

{
  "status": "queued"
}
```

Valid statuses: `queued`, `crawling`, `success`, `failed`

#### Update Job Priority
```
PUT /api/admin/jobs/{id}/priority
Content-Type: application/json

{
  "priority": 50
}
```

#### Boost Job Priority
```
POST /api/admin/jobs/{id}/boost
Content-Type: application/json

{
  "boost": 20
}
```

Increases the job's priority by the specified amount (capped at 100).

#### Retry Job
```
POST /api/admin/jobs/{id}/retry
```

Resets a failed job back to queued status with retry_count = 0.

#### Bulk Update Job Status
```
PUT /api/admin/jobs/bulk/status
Content-Type: application/json

{
  "job_ids": [1, 2, 3, 4, 5],
  "status": "queued"
}
```

#### Bulk Retry Jobs
```
POST /api/admin/jobs/bulk/retry
Content-Type: application/json

{
  "job_ids": [1, 2, 3, 4, 5]
}
```

### Scheduled Job Management

#### List Scheduled Jobs
```
GET /api/admin/scheduled-jobs?limit=100&offset=0
```

#### Create Scheduled Job
```
POST /api/admin/scheduled-jobs
Content-Type: application/json

{
  "name": "daily-askreddit",
  "description": "Daily crawl of AskReddit",
  "subreddit_id": 1,
  "cron_expression": "@daily",
  "enabled": true,
  "priority": 10
}
```

#### Get Scheduled Job
```
GET /api/admin/scheduled-jobs/{id}
```

#### Update Scheduled Job
```
PUT /api/admin/scheduled-jobs/{id}
Content-Type: application/json

{
  "name": "hourly-worldnews",
  "description": "Hourly crawl of WorldNews",
  "cron_expression": "@hourly",
  "enabled": true,
  "priority": 20
}
```

#### Delete Scheduled Job
```
DELETE /api/admin/scheduled-jobs/{id}
```

#### Toggle Scheduled Job
```
POST /api/admin/scheduled-jobs/{id}/toggle
Content-Type: application/json

{
  "enabled": false
}
```

## Database Schema

### crawl_jobs Table

```sql
CREATE TABLE crawl_jobs (
  id SERIAL PRIMARY KEY,
  subreddit_id INTEGER NOT NULL UNIQUE REFERENCES subreddits(id),
  status TEXT NOT NULL DEFAULT 'queued',
  priority INT DEFAULT 0,
  retries INT DEFAULT 0, -- Legacy field, kept for backward compatibility
  last_attempt TIMESTAMPTZ DEFAULT now(),
  duration_ms INT,
  enqueued_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Visibility timeout and retry fields (new)
  visible_at TIMESTAMPTZ DEFAULT now(),
  retry_count INT DEFAULT 0, -- New retry counter with visibility timeout support
  max_retries INT DEFAULT 3,
  next_retry_at TIMESTAMPTZ
);
```

### scheduled_jobs Table

```sql
CREATE TABLE scheduled_jobs (
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
  created_by TEXT
);
```

## Configuration

### Environment Variables

- `STALE_DAYS`: Days before a subreddit is considered stale (default: 30)
- `RESET_CRAWLING_AFTER_MIN`: Minutes before resetting stuck "crawling" jobs (default: 15)

### Worker Configuration

The crawler runs with the following intervals:

- **Job Processing**: Every 5 seconds
- **Maintenance Tasks**: Every 5 minutes
  - Requeue retryable jobs
  - Age starved jobs
- **Stale Subreddit Check**: Every 6 hours

The scheduler runs with the following intervals:

- **Scheduled Job Check**: Every 1 minute

## Best Practices

### Prioritizing Jobs

1. **User-Requested Crawls**: Set priority to 50-70
2. **Scheduled Crawls**: Set priority to 10-30
3. **Discovery/Background Crawls**: Keep default priority (0)

### Retry Configuration

- Set `max_retries` to 3-5 for normal operations
- Set higher `max_retries` (10+) for critical subreddits
- Monitor failed jobs and investigate patterns

### Scheduled Jobs

- Use `@daily` or `@weekly` for most subreddits
- Use `@hourly` only for high-traffic subreddits
- Enable priority for scheduled jobs to ensure timely execution
- Disable scheduled jobs during maintenance windows

## Monitoring

### Key Metrics

- **Queue Depth**: Number of jobs in "queued" status
- **Failed Job Rate**: Percentage of jobs that fail
- **Retry Success Rate**: Jobs that succeed after retry
- **Priority Distribution**: Histogram of job priorities
- **Average Wait Time**: Time from enqueue to execution

### Alerts

Consider setting alerts for:

- Queue depth > 1000 jobs
- Failed job rate > 10%
- Jobs stuck in "crawling" for > 1 hour
- Scheduled jobs missing their execution window

## Troubleshooting

### Jobs Not Processing

1. Check if crawler is running
2. Verify database connectivity
3. Check for jobs stuck in "crawling" status
4. Review logs for errors

### Failed Jobs Not Retrying

1. Verify `retry_count < max_retries`
2. Check `next_retry_at` timestamp
3. Ensure maintenance ticker is running (every 5 minutes)

### Scheduled Jobs Not Running

1. Check if scheduled job is enabled
2. Verify `next_run_at` timestamp is in the past
3. Check scheduler service is running
4. Review logs for cron expression parsing errors

### Priority Not Working

1. Verify priority values are set correctly
2. Check if aging mechanism is running
3. Ensure ClaimNextJob is using priority in ORDER BY clause
