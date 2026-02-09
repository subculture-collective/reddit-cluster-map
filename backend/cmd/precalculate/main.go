package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
	"github.com/onnwee/reddit-cluster-map/backend/internal/admin"
	"github.com/onnwee/reddit-cluster-map/backend/internal/config"
	"github.com/onnwee/reddit-cluster-map/backend/internal/crawler"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
	"github.com/onnwee/reddit-cluster-map/backend/internal/errorreporting"
	"github.com/onnwee/reddit-cluster-map/backend/internal/graph"
	"github.com/onnwee/reddit-cluster-map/backend/internal/logger"
	"github.com/onnwee/reddit-cluster-map/backend/internal/tracing"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize structured logging
	logger.Init(cfg.LogLevel)
	logger.Info("Initializing graph precalculation", "version", cfg.SentryRelease, "log_level", cfg.LogLevel)

	// Initialize error reporting
	if err := errorreporting.Init(cfg.SentryEnvironment); err != nil {
		logger.Warn("Failed to initialize error reporting", "error", err)
	} else if errorreporting.IsSentryEnabled() {
		logger.Info("Error reporting initialized", "environment", cfg.SentryEnvironment)
		defer func() {
			logger.Info("Flushing error reports...")
			errorreporting.Flush(2 * time.Second)
		}()
	}

	// Initialize tracing
	shutdownTracing, err := tracing.Init("reddit-cluster-map-precalculate")
	if err != nil {
		logger.Warn("Failed to initialize tracing", "error", err)
	} else if cfg.OTELEnabled {
		logger.Info("Tracing initialized", "endpoint", cfg.OTELEndpoint, "sample_rate", cfg.OTELSampleRate)
		defer func() {
			logger.Info("Shutting down tracer...")
			if err := shutdownTracing(context.Background()); err != nil {
				logger.Error("Failed to shutdown tracer", "error", err)
			}
		}()
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		logger.Error("DATABASE_URL environment variable not set")
		log.Fatal("DATABASE_URL environment variable not set")
	}
	dbConn, err := sql.Open("postgres", dbURL)
	if err != nil {
		logger.Error("Failed to initialize DB", "error", err)
		log.Fatalf("Failed to initialize DB: %v", err)
	}
	defer dbConn.Close()

	// Configure connection pool for precalculation (moderate connections needed)
	dbConn.SetMaxOpenConns(15)                  // Moderate pool for graph computation
	dbConn.SetMaxIdleConns(5)                   // Keep some idle connections
	dbConn.SetConnMaxLifetime(10 * time.Minute) // Longer lifetime for batch jobs
	dbConn.SetConnMaxIdleTime(5 * time.Minute)  // Longer idle time for batch jobs

	// Verify connection is working
	{
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := dbConn.PingContext(ctx); err != nil {
			logger.Error("Failed to ping database", "error", err)
			log.Fatalf("Failed to ping database: %v", err)
		}
		logger.Info("Database connection established")
	}

	queries := db.New(dbConn)
	// Honor admin toggle; if disabled, exit cleanly
	if ok, _ := admin.GetBool(context.Background(), queries, "precalc_enabled", true); !ok {
		logger.Info("Precalculation disabled by admin flag; exiting")
		return
	}
	graphService := graph.NewService(queries)

	ctx := context.Background()
	// On startup: optionally force-clear graph tables if PRECALC_FORCE_CLEAR=true
	if os.Getenv("PRECALC_FORCE_CLEAR") == "1" || os.Getenv("PRECALC_FORCE_CLEAR") == "true" {
		logger.Info("PRECALC_FORCE_CLEAR enabled: clearing graph tables and restarting from scratch")
		if err := queries.ClearGraphTables(ctx); err != nil {
			logger.Error("Failed to clear graph tables", "error", err)
			log.Fatalf("failed to clear graph tables: %v", err)
		}
	}

	// Reset any incomplete crawl jobs so they can be resumed
	resetOlder := time.Duration(cfg.ResetCrawlingAfterMin) * time.Minute
	if err := crawler.ResetIncompleteJobs(ctx, queries, resetOlder); err != nil {
		logger.Warn("Failed to reset incomplete jobs", "error", err)
	}

	// Requeue stale subreddits for recalculation based on configured StaleDays
	staleDays := cfg.StaleDays
	if staleDays > 0 {
		if err := crawler.RequeueStaleSubreddits(ctx, queries, time.Duration(staleDays)*24*time.Hour); err != nil {
			logger.Warn("Failed to requeue stale subreddits", "error", err)
		}
	}

	// Always run once at start when enabled (may defer if not enough data yet)
	runOnce(ctx, dbConn, queries, graphService)

	// Run continuously on a configurable interval (default 1h)
	interval := time.Hour
	if iv := os.Getenv("PRECALC_INTERVAL"); iv != "" {
		if d, err := time.ParseDuration(iv); err == nil {
			interval = d
		}
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			// If admin disabled, skip run
			if ok, _ := admin.GetBool(context.Background(), queries, "precalc_enabled", true); !ok {
				logger.Info("Precalc disabled by admin flag; skipping this run")
				continue
			}
			runOnce(ctx, dbConn, queries, graphService)
		}
	}
}

// hasMinSubredditsWithPosts returns true if at least `min` distinct subreddits have posts stored
func hasMinSubredditsWithPosts(ctx context.Context, dbc *sql.DB, min int) (bool, int, error) {
	var cnt int
	err := dbc.QueryRowContext(ctx, "SELECT COUNT(DISTINCT subreddit_id) FROM posts").Scan(&cnt)
	if err != nil {
		return false, 0, fmt.Errorf("count distinct subreddit_id in posts failed: %w", err)
	}
	return cnt >= min, cnt, nil
}

func runOnce(ctx context.Context, dbc *sql.DB, queries *db.Queries, graphService *graph.Service) {
	// Defer precalc until at least two subreddits have been crawled (i.e., produced posts)
	if ok, cnt, err := hasMinSubredditsWithPosts(ctx, dbc, 2); err != nil {
		logger.Error("Precalc readiness check failed", "error", err)
		return
	} else if !ok {
		logger.Info("Precalc deferred: insufficient data", "subreddits_with_posts", cnt, "required", 2)
		return
	}
	if err := graphService.PrecalculateGraphData(ctx); err != nil {
		logger.Error("Failed to precalculate graph data", "error", err)
		errorreporting.CaptureError(err)
		return
	}
	logger.Info("Graph data precalculated successfully")
}
