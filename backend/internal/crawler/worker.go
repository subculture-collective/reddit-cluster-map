package crawler

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"time"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
	"github.com/onnwee/reddit-cluster-map/backend/internal/utils"
)

func StartCrawlWorker(ctx context.Context, q *db.Queries) {
	log.Printf("🔁 Starting crawl worker...")

	defaultSubs := utils.GetEnvAsSlice("DEFAULT_SUBREDDITS", []string{
		"AskReddit", "politics", "technology", "worldnews", "gaming",
	}, ",")

	for {
		// Check if parent context is done
		select {
		case <-ctx.Done():
			log.Println("🛑 Crawl worker exiting: context canceled")
			return
		default:
		}

		// Use a short timeout on each job fetch to allow periodic context cancellation checks
		jobCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()

		job, err := q.GetNextCrawlJob(jobCtx)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				log.Println("🟡 No crawl jobs available.")
				time.Sleep(time.Second * 5)
				continue
			}
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				continue
			}
			log.Printf("❌ Failed to get next crawl job: %v", err)
			time.Sleep(time.Second * 5)
			continue
		}

		if job.ID == 0 {
			sub := utils.PickRandomString(defaultSubs)
			log.Printf("🟡 No job found, using fallback: r/%s", sub)
			_ = q.EnqueueCrawlJob(ctx, sub)
			time.Sleep(5 * time.Second)
			continue
		}

		log.Printf("🕷️ Crawling: %s (job #%d)", job.Subreddit, job.ID)
		if err := q.MarkCrawlJobStarted(ctx, job.ID); err != nil {
			log.Printf("⚠️ Failed to mark job as started: %v", err)
			continue
		}

		if err := handleJob(ctx, q, job); err != nil {
			log.Printf("❌ Job %d (r/%s) failed: %v", job.ID, job.Subreddit, err)
			_ = q.MarkCrawlJobFailed(ctx, job.ID)
		} else {
			_ = q.MarkCrawlJobSuccess(ctx, job.ID)
		}
	}
}
