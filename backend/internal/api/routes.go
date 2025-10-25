package api

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/onnwee/reddit-cluster-map/backend/internal/api/handlers"
	"github.com/onnwee/reddit-cluster-map/backend/internal/config"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
	"github.com/onnwee/reddit-cluster-map/backend/internal/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func NewRouter(q *db.Queries) *mux.Router {
	// Create the root router. All routes below are relative to this router.
	r := mux.NewRouter()

	// Load configuration
	cfg := config.Load()

	// Apply global middleware in order
	// 1. Security headers (first to ensure they're always set)
	r.Use(middleware.SecurityHeaders)

	// 2. CORS middleware
	corsConfig := &middleware.CORSConfig{
		AllowedOrigins:   cfg.CORSAllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}
	r.Use(middleware.CORS(corsConfig))

	// 3. Request body validation
	r.Use(middleware.ValidateRequestBody)

	// 4. Rate limiting (if enabled)
	if cfg.EnableRateLimit {
		rateLimiter := middleware.NewRateLimiter(
			cfg.RateLimitGlobal,
			cfg.RateLimitGlobalBurst,
			cfg.RateLimitPerIP,
			cfg.RateLimitPerIPBurst,
		)
		r.Use(rateLimiter.Limit)
	}

	// Lightweight healthcheck: GET /health -> {"status":"ok"}
	r.HandleFunc("/health", handlers.Health).Methods("GET")

	// Prometheus metrics endpoint
	r.Handle("/metrics", promhttp.Handler()).Methods("GET")

	// OAuth login/callback for Reddit user authorization
	auth := handlers.NewAuthHandlers(q)
	r.HandleFunc("/auth/login", auth.Login).Methods("GET")
	r.HandleFunc("/auth/callback", auth.Callback).Methods("GET")

	// Alternate paths to support externally configured redirect URIs
	// e.g., https://<host>/oauth/reddit/callback used in production
	r.HandleFunc("/oauth/reddit/login", auth.Login).Methods("GET")
	r.HandleFunc("/oauth/reddit/callback", auth.Callback).Methods("GET")

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

	// Community aggregation endpoints
	communityHandler := handlers.NewCommunityHandler(q)
	r.HandleFunc("/api/communities", communityHandler.GetCommunities).Methods("GET")
	r.HandleFunc("/api/communities/{id}", communityHandler.GetCommunityByID).Methods("GET")

	// Admin: toggle background services (gated)
	admin := handlers.NewAdminHandler(q)
	// We'll define adminOnly below, so temporarily register after it's declared.
	// precalc is handled in its own service; no run-now route
	// Crawl status
	r.HandleFunc("/api/crawl/status", handlers.GetCrawlStatus(q)).Methods("GET")

	// Admin auth middleware using a static bearer token from env
	adminOnly := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if cfg.AdminAPIToken == "" {
				http.Error(w, "admin token not configured", http.StatusServiceUnavailable)
				return
			}
			auth := r.Header.Get("Authorization")
			const prefix = "Bearer "
			if len(auth) <= len(prefix) || auth[:len(prefix)] != prefix || auth[len(prefix):] != cfg.AdminAPIToken {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}

	// Backups (read-only): list and download files from mounted volume, gated by adminOnly
	r.Handle("/api/admin/backups", adminOnly(http.HandlerFunc(handlers.ListBackups))).Methods("GET")
	r.Handle("/api/admin/backups/{name}", adminOnly(http.HandlerFunc(handlers.DownloadBackup))).Methods("GET")
	// Services endpoints gated by adminOnly
	r.Handle("/api/admin/services", adminOnly(http.HandlerFunc(admin.GetServices))).Methods("GET")
	r.Handle("/api/admin/services", adminOnly(http.HandlerFunc(admin.UpdateServices))).Methods("POST")

	return r
}
