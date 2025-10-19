package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	"github.com/onnwee/reddit-cluster-map/backend/internal/crawler"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
	"github.com/onnwee/reddit-cluster-map/backend/internal/middleware"
)

type CrawlRequest struct {
	Subreddit string `json:"subreddit"`
}

// CrawlQueue abstracts the queries used by PostCrawl for testability.
type CrawlQueue interface {
	UpsertSubreddit(ctx context.Context, p db.UpsertSubredditParams) (int32, error)
	CrawlJobExists(ctx context.Context, subredditID int32) (bool, error)
	EnqueueCrawlJob(ctx context.Context, p db.EnqueueCrawlJobParams) error
}

func PostCrawl(q CrawlQueue) http.HandlerFunc {
	sanitizer := &middleware.SanitizeInput{}
	
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[PostCrawl] Received request: %v", r)
		
		// Validate content type
		if err := middleware.ValidateJSON(r); err != nil {
			http.Error(w, `{"error":"Invalid request format"}`, http.StatusBadRequest)
			return
		}
		
		var req CrawlRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
			return
		}

		// Sanitize and validate subreddit name
		req.Subreddit = sanitizer.SanitizeString(req.Subreddit, 21)
		if req.Subreddit == "" {
			req.Subreddit = "AskReddit"
		}
		
		if err := sanitizer.ValidateSubredditName(req.Subreddit); err != nil {
			http.Error(w, `{"error":"Invalid subreddit name"}`, http.StatusBadRequest)
			return
		}

		// First get or create the subreddit to get its ID
		subreddit, err := q.UpsertSubreddit(r.Context(), db.UpsertSubredditParams{
			Name:        req.Subreddit,
			Title:       sql.NullString{String: req.Subreddit, Valid: true},
			Description: sql.NullString{String: "", Valid: true},
			Subscribers: sql.NullInt32{Int32: 0, Valid: true},
		})
		if err != nil {
			log.Printf("❌ Failed to upsert subreddit %s: %v", req.Subreddit, err)
			http.Error(w, `{"error":"Failed to create subreddit"}`, http.StatusInternalServerError)
			return
		}

		// Ensure a job exists; if already queued/crawling, do nothing.
		if exists, err := q.CrawlJobExists(r.Context(), subreddit); err == nil {
			if !exists {
				if err := q.EnqueueCrawlJob(r.Context(), db.EnqueueCrawlJobParams{
					SubredditID: subreddit,
					EnqueuedBy:  sql.NullString{String: "api", Valid: true},
				}); err != nil {
					log.Printf("❌ Failed to enqueue %s: %v", req.Subreddit, err)
					http.Error(w, `{"error":"Failed to enqueue job"}`, http.StatusInternalServerError)
					return
				}
			} else {
				// Promote requested subreddit job by bumping priority.
				_ = crawler.BumpPriority(r.Context(), q.(*db.Queries), subreddit, 1)
			}
		}

		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte("Seeded and crawler started.\n"))
	}
}
