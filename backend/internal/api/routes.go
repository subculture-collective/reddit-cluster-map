package api

import (
	"github.com/gorilla/mux"
	"github.com/onnwee/subnet/internal/api/handlers"
	"github.com/onnwee/subnet/internal/db/gen"
)

func NewRouter(q *gen.Queries) *mux.Router {
	r := mux.NewRouter()

	// Subreddit routes
	r.HandleFunc("/subreddits", handlers.GetSubreddits(q)).Methods("GET")

	// TODO: Add more routes here

	return r
}
