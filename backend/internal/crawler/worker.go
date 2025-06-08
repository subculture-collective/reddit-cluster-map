package crawler

import (
	"context"
	"database/sql"

	"fmt"
	"log"

	"time"

	_ "github.com/lib/pq" // Import the postgres driver
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
	log.Println("🚀 Starting crawler...")
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("🛑 Crawler stopped by context")
			return
		case <-c.stop:
			log.Println("🛑 Crawler stopped by signal")
			return
		case <-ticker.C:
			if err := c.processNextJob(ctx); err != nil {
				log.Printf("⚠️ Error processing job: %v", err)
			}
		}
	}
}

// Stop gracefully stops the crawler
func (c *Crawler) Stop() {
	close(c.stop)
}

// processNextJob handles a single crawl job
func (c *Crawler) processNextJob(ctx context.Context) error {
	job, err := c.queries.GetNextCrawlJob(ctx)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		return fmt.Errorf("failed to get next job: %w", err)
	}

	return handleJob(ctx, c.queries, job)
}
