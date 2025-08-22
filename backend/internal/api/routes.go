package api

import (
	"github.com/gorilla/mux"
	"github.com/onnwee/reddit-cluster-map/backend/internal/api/handlers"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

func NewRouter(q *db.Queries) *mux.Router {
	// Create the root router. All routes below are relative to this router.
	r := mux.NewRouter()

	// Lightweight healthcheck: GET /health -> {"status":"ok"}
	r.HandleFunc("/health", handlers.Health).Methods("GET")

	// OAuth login/callback for Reddit user authorization
	auth := handlers.NewAuthHandlers(q)
	r.HandleFunc("/auth/login", auth.Login).Methods("GET")
	r.HandleFunc("/auth/callback", auth.Callback).Methods("GET")

	// REST-style resources (no /api prefix) for internal/admin queries
	// Subreddits list: GET /subreddits?limit=&offset=
	r.HandleFunc("/subreddits", handlers.GetSubreddits(q)).Methods("GET")

	// Explicit API endpoints with /api prefix intended for frontend use
	// Enqueue a subreddit crawl: POST /api/crawl {"subreddit":"name"}
	r.HandleFunc("/api/crawl", handlers.PostCrawl(q)).Methods("POST")

	// Users list: GET /users?limit=&offset=
	r.HandleFunc("/users", handlers.GetUsers(q)).Methods("GET")

	// Posts by subreddit: GET /posts?subreddit_id=&limit=&offset=
	r.HandleFunc("/posts", handlers.GetPosts(q)).Methods("GET")

	// Comments by post: GET /comments?post_id=
	r.HandleFunc("/comments", handlers.GetComments(q)).Methods("GET")

	// Crawl jobs list: GET /jobs?limit=&offset=
	r.HandleFunc("/jobs", handlers.GetCrawlJobs(q)).Methods("GET")

	// Graph data for the frontend: GET /api/graph
	graphHandler := handlers.NewHandler(q)
	r.HandleFunc("/api/graph", graphHandler.GetGraphData).Methods("GET")

	// Admin: toggle background services
	admin := handlers.NewAdminHandler(q)
	r.HandleFunc("/api/admin/services", admin.GetServices).Methods("GET")
	r.HandleFunc("/api/admin/services", admin.UpdateServices).Methods("POST")
	// precalc is handled in its own service; no run-now route
	// Crawl status
	r.HandleFunc("/api/crawl/status", handlers.GetCrawlStatus(q)).Methods("GET")
	
	return r
}
