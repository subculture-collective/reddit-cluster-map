package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

type CrawlRequest struct {
	Subreddit string `json:"subreddit"`
}

func PostCrawl(q *db.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[PostCrawl] Received request: %v", r)
		var req CrawlRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		req.Subreddit = strings.TrimSpace(req.Subreddit)
		if req.Subreddit == "" {
			req.Subreddit = "AskReddit"
		}
		if strings.ContainsAny(req.Subreddit, "/\\ ") {
			http.Error(w, "Invalid subreddit name", http.StatusBadRequest)
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
			http.Error(w, "Failed to create subreddit", http.StatusInternalServerError)
			return
		}

		if err := q.EnqueueCrawlJob(r.Context(), db.EnqueueCrawlJobParams{
			SubredditID: subreddit,
			EnqueuedBy:  sql.NullString{String: "api", Valid: true},
		}); err != nil {
			log.Printf("❌ Failed to enqueue %s: %v", req.Subreddit, err)
			http.Error(w, "Failed to enqueue job", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte("Seeded and crawler started.\n"))
	}
}
