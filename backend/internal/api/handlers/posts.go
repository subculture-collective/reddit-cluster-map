package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

func GetPosts(q *db.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		posts, err := q.ListPosts(r.Context())
		if err != nil {
			http.Error(w, "Failed to fetch posts", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(posts)
	}
}
