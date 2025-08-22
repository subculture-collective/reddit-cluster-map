package crawler

import (
	"context"
	"database/sql"

	"fmt"
	"log"

	"time"

	_ "github.com/lib/pq" // Import the postgres driver
	"github.com/onnwee/reddit-cluster-map/backend/internal/admin"
	"github.com/onnwee/reddit-cluster-map/backend/internal/config"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

// checkAndRequeueStaleSubreddits checks for subreddits that haven't been crawled in 7 days
// and requeues them for crawling.
func checkAndRequeueStaleSubreddits(ctx context.Context, q *db.Queries) error {
	staleSubs, err := q.GetStaleSubreddits(ctx)
	if err != nil {
		return fmt.Errorf("failed to get stale subreddits: %w", err)
	}

	for _, sub := range staleSubs {
		log.Printf("🔄 Requeueing stale subreddit: r/%s", sub)
		// Get subreddit ID
		subreddit, err := q.GetSubreddit(ctx, sub)
		if err != nil {
			log.Printf("⚠️ Failed to get subreddit r/%s: %v", sub, err)
			continue
		}

		if err := q.EnqueueCrawlJob(ctx, db.EnqueueCrawlJobParams{
			SubredditID: subreddit.ID,
			EnqueuedBy:  sql.NullString{String: "system", Valid: true},
		}); err != nil {
			log.Printf("⚠️ Failed to requeue stale subreddit r/%s: %v", sub, err)
		}
	}

	return nil
}

// Crawler represents a Reddit crawler instance
type Crawler struct {
	queries *db.Queries
	stop    chan struct{}
}

// NewCrawler creates a new crawler instance
func NewCrawler(q *db.Queries) *Crawler {
	return &Crawler{
		queries: q,
		stop:    make(chan struct{}),
	}
}

// Start begins the crawler process
func (c *Crawler) Start(ctx context.Context) {
	// Main crawler loop: wakes up on a short interval, grabs one queued job, processes it.
	log.Println("🚀 Starting crawler...")
	// On start, reset stale in-progress jobs (e.g., container restarts)
	cfg := config.Load()
	_ = ResetIncompleteJobs(ctx, c.queries, time.Duration(cfg.ResetCrawlingAfterMin)*time.Minute)
	ticker := time.NewTicker(5 * time.Second)
	staleTicker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()
	defer staleTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("🛑 Crawler stopped by context")
			return
		case <-c.stop:
			log.Println("🛑 Crawler stopped by signal")
			return
		case <-ticker.C:
			// Check if disabled via admin flag
			enabled, _ := admin.GetBool(ctx, c.queries, "crawler_enabled", true)
			if !enabled {
				// skip quietly; avoid noisy logs every tick
				continue
			}
			// Pull the next queued job, if any, and process it end-to-end.
			if err := c.processNextJob(ctx); err != nil {
				log.Printf("⚠️ Error processing job: %v", err)
			}
		case <-staleTicker.C:
			// Periodically requeue subs not crawled in a while to keep data fresh.
			if err := checkAndRequeueStaleSubreddits(ctx, c.queries); err != nil {
				log.Printf("⚠️ Failed to requeue stale subreddits: %v", err)
			}
			// Also enqueue any subreddits not seen in configured TTL in created_at order
			_ = RequeueStaleSubreddits(ctx, c.queries, time.Duration(cfg.StaleDays)*24*time.Hour)
		}
	}
}

// Stop gracefully stops the crawler
func (c *Crawler) Stop() {
	close(c.stop)
}

// processNextJob handles a single crawl job
func (c *Crawler) processNextJob(ctx context.Context) error {
	job, err := ClaimNextJob(ctx, c.queries)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		return fmt.Errorf("failed to claim next job: %w", err)
	}

	return handleJob(ctx, c.queries, job)
}
