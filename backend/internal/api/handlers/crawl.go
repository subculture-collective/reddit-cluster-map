package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/onnwee/reddit-cluster-map/backend/internal/crawler"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

type CrawlRequest struct {
	Subreddit string `json:"subreddit"`
}

func PostCrawl(q *db.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

		if err := q.EnqueueCrawlJob(r.Context(), req.Subreddit); err != nil {
			log.Printf("❌ Failed to enqueue %s: %v", req.Subreddit, err)
			http.Error(w, "Failed to enqueue job", http.StatusInternalServerError)
			return
		}

		// ⚠️ Consider only calling StartDBBackedCrawl once globally instead of per request
		go crawler.StartCrawlWorker(r.Context(), q)

		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte("Seeded and crawler started.\n"))
	}
}
