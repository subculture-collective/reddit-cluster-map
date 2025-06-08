package crawler

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq" // Import the postgres driver
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
	"github.com/onnwee/reddit-cluster-map/backend/internal/utils"
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
		if err := q.EnqueueCrawlJob(ctx, sub); err != nil {
			log.Printf("⚠️ Failed to requeue stale subreddit r/%s: %v", sub, err)
		}
	}

	return nil
}

func StartCrawlWorker(ctx context.Context, q *db.Queries) {
	log.Printf("🔁 Starting crawl worker...")

	defaultSubs := utils.GetEnvAsSlice("DEFAULT_SUBREDDITS", []string{
		"AskReddit", "politics", "technology", "worldnews", "gaming",
	}, ",")

	// Check for stale subreddits every hour
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		// Check if parent context is done
		select {
		case <-ctx.Done():
			log.Println("🛑 Crawl worker exiting: context canceled")
			return
		case <-ticker.C:
			if err := checkAndRequeueStaleSubreddits(ctx, q); err != nil {
				log.Printf("⚠️ Failed to check stale subreddits: %v", err)
			}
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

// NewCrawler initializes and returns a new crawler instance.
func NewCrawler() (*Crawler, error) {
	// Initialize database connection
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is not set")
	}

	conn, err := sql.Open("postgres", dbURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Create a Queries instance
	queries := db.New(conn)

	return &Crawler{
		queries: queries,
	}, nil
}

// Crawler represents a crawler instance.
type Crawler struct {
	queries *db.Queries
}

// Start starts the crawler.
func (c *Crawler) Start() error {
	// Use the existing StartCrawlWorker function to start the crawler
	ctx := context.Background()
	StartCrawlWorker(ctx, c.queries)
	return nil
}

// Stop stops the crawler.
func (c *Crawler) Stop() error {
	// Implement the stop logic here
	return nil
}
