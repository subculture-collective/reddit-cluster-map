package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

func GetSubredditEdges(q *db.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		edges, err := q.ListSubredditEdges(r.Context())
		if err != nil {
			http.Error(w, "Failed to fetch subreddit edges", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(edges)
	}
}
