package api

import (
	"github.com/gorilla/mux"
	"github.com/onnwee/reddit-cluster-map/backend/internal/api/handlers"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

func NewRouter(q *db.Queries) *mux.Router {
	r := mux.NewRouter()

	// Subreddits
	r.HandleFunc("/subreddits", handlers.GetSubreddits(q)).Methods("GET")

	// Crawl
	r.HandleFunc("/api/crawl", handlers.PostCrawl(q)).Methods("POST")

	// Users
	r.HandleFunc("/users", handlers.GetUsers(q)).Methods("GET")

	// Posts
	r.HandleFunc("/posts", handlers.GetPosts(q)).Methods("GET")

	// Comments
	r.HandleFunc("/comments", handlers.GetComments(q)).Methods("GET")

	// Crawl Jobs
	r.HandleFunc("/jobs", handlers.GetCrawlJobs(q)).Methods("GET")

	// Graph
	graphHandler := handlers.NewHandler(q)
	r.HandleFunc("/api/graph", graphHandler.GetGraphData).Methods("GET")
	
	return r
}
