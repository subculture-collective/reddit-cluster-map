package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/onnwee/subnet/internal/db/gen"
)

func GetSubreddits(q *gen.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		subs, err := q.ListSubreddits(r.Context())
		if err != nil {
			http.Error(w, "Failed to fetch subreddits", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(subs)
	}
}
