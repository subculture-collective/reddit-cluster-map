package config

import (
	"os"
	"strings"
	"time"

	"github.com/onnwee/reddit-cluster-map/backend/internal/utils"
)

// Config holds application configuration derived from environment variables.
type Config struct {
	UserAgent          string
	HTTPMaxRetries     int
	HTTPRetryBase      time.Duration
	HTTPTimeout        time.Duration
	LogHTTPRetries     bool
	GraphQueryTimeout  time.Duration
	DBStatementTimeout time.Duration
	DetailedGraph      bool
	PostsPerSubInGraph int
	CommentsPerPost    int
	MaxAuthorLinks     int
	MaxPostsPerSub     int
	PostsSort          string
	PostsTimeFilter    string
	// Reddit OAuth (user-auth) configuration
	RedditClientID     string
	RedditClientSecret string
	RedditRedirectURI  string
	RedditScopes       string
	// Crawler scheduling
	StaleDays             int
	ResetCrawlingAfterMin int
	// API background graph job control
	DisableAPIGraphJob bool
	// Admin API token for gating admin endpoints (Bearer token)
	AdminAPIToken string
}

var cached *Config

// Load reads env vars once and caches them.
func Load() *Config {
	if cached != nil {
		return cached
	}
	ua := os.Getenv("REDDIT_USER_AGENT")
	if strings.TrimSpace(ua) == "" {
		ua = "reddit-cluster-map/0.1"
	}
	cached = &Config{
		UserAgent:             ua,
		HTTPMaxRetries:        utils.GetEnvAsInt("HTTP_MAX_RETRIES", 3),
		HTTPRetryBase:         time.Duration(utils.GetEnvAsInt("HTTP_RETRY_BASE_MS", 300)) * time.Millisecond,
		HTTPTimeout:           time.Duration(utils.GetEnvAsInt("HTTP_TIMEOUT_MS", 15000)) * time.Millisecond,
		LogHTTPRetries:        utils.GetEnvAsBool("LOG_HTTP_RETRIES", false),
		GraphQueryTimeout:     time.Duration(utils.GetEnvAsInt("GRAPH_QUERY_TIMEOUT_MS", 30000)) * time.Millisecond,
		DBStatementTimeout:    time.Duration(utils.GetEnvAsInt("DB_STATEMENT_TIMEOUT_MS", 25000)) * time.Millisecond,
		DetailedGraph:         utils.GetEnvAsBool("DETAILED_GRAPH", false),
		PostsPerSubInGraph:    utils.GetEnvAsInt("POSTS_PER_SUB_IN_GRAPH", 10),
		CommentsPerPost:       utils.GetEnvAsInt("COMMENTS_PER_POST_IN_GRAPH", 50),
		MaxAuthorLinks:        utils.GetEnvAsInt("MAX_AUTHOR_CONTENT_LINKS", 3),
		MaxPostsPerSub:        utils.GetEnvAsInt("MAX_POSTS_PER_SUB", 25),
		PostsSort:             strings.ToLower(strings.TrimSpace(os.Getenv("POSTS_SORT"))),
		PostsTimeFilter:       strings.ToLower(strings.TrimSpace(os.Getenv("POSTS_TIME_FILTER"))),
		RedditClientID:        strings.TrimSpace(os.Getenv("REDDIT_CLIENT_ID")),
		RedditClientSecret:    strings.TrimSpace(os.Getenv("REDDIT_CLIENT_SECRET")),
		RedditRedirectURI:     strings.TrimSpace(os.Getenv("REDDIT_REDIRECT_URI")),
		RedditScopes:          strings.TrimSpace(os.Getenv("REDDIT_SCOPES")),
		StaleDays:             utils.GetEnvAsInt("STALE_DAYS", 30),
		ResetCrawlingAfterMin: utils.GetEnvAsInt("RESET_CRAWLING_AFTER_MIN", 15),
		DisableAPIGraphJob:    utils.GetEnvAsBool("DISABLE_API_GRAPH_JOB", false),
		AdminAPIToken:         strings.TrimSpace(os.Getenv("ADMIN_API_TOKEN")),
	}
	if cached.PostsSort == "" {
		cached.PostsSort = "top"
	}
	if cached.PostsTimeFilter == "" {
		cached.PostsTimeFilter = "day"
	}
	return cached
}

// ResetForTest clears cached config; for use in tests only.
func ResetForTest() { cached = nil }

// GetEnvBool reads a boolean environment variable with a default.
// Use this when you need to check a flag not present in the cached config.
func (c *Config) GetEnvBool(key string, def bool) bool {
	return utils.GetEnvAsBool(key, def)
}
