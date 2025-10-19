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
	"github.com/onnwee/reddit-cluster-map/backend/internal/graph"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL environment variable not set")
	}
	dbConn, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to initialize DB: %v", err)
	}
	defer dbConn.Close()

	queries := db.New(dbConn)
	// Honor admin toggle; if disabled, exit cleanly
	if ok, _ := admin.GetBool(context.Background(), queries, "precalc_enabled", true); !ok {
		log.Println("Precalculation disabled by admin flag; exiting")
		return
	}
	graphService := graph.NewService(queries)

	ctx := context.Background()
	// On startup: optionally force-clear graph tables if PRECALC_FORCE_CLEAR=true
	if os.Getenv("PRECALC_FORCE_CLEAR") == "1" || os.Getenv("PRECALC_FORCE_CLEAR") == "true" {
		log.Println("PRECALC_FORCE_CLEAR enabled: clearing graph tables and restarting from scratch")
		if err := queries.ClearGraphTables(ctx); err != nil {
			log.Fatalf("failed to clear graph tables: %v", err)
		}
	}

	// Reset any incomplete crawl jobs so they can be resumed
	cfg := config.Load()
	resetOlder := time.Duration(cfg.ResetCrawlingAfterMin) * time.Minute
	if err := crawler.ResetIncompleteJobs(ctx, queries, resetOlder); err != nil {
		log.Printf("warning: failed to reset incomplete jobs: %v", err)
	}

	// Requeue stale subreddits for recalculation based on configured StaleDays
	staleDays := cfg.StaleDays
	if staleDays > 0 {
		if err := crawler.RequeueStaleSubreddits(ctx, queries, time.Duration(staleDays)*24*time.Hour); err != nil {
			log.Printf("warning: failed to requeue stale subreddits: %v", err)
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
				log.Println("precalc disabled by admin flag; skipping this run")
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
		log.Printf("precalc readiness check failed: %v", err)
		return
	} else if !ok {
		log.Printf("precalc deferred: only %d subreddit(s) with posts; need at least 2", cnt)
		return
	}
	if err := graphService.PrecalculateGraphData(ctx); err != nil {
		log.Printf("Failed to precalculate graph data: %v", err)
		return
	}
	log.Println("Graph data precalculated successfully")
}
