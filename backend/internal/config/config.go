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
	DetailedGraph      bool
	PostsPerSubInGraph int
	CommentsPerPost    int
	MaxAuthorLinks     int
	MaxPostsPerSub     int
	PostsSort          string
	PostsTimeFilter    string
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
		UserAgent:          ua,
		HTTPMaxRetries:     utils.GetEnvAsInt("HTTP_MAX_RETRIES", 3),
		HTTPRetryBase:      time.Duration(utils.GetEnvAsInt("HTTP_RETRY_BASE_MS", 300)) * time.Millisecond,
		HTTPTimeout:        time.Duration(utils.GetEnvAsInt("HTTP_TIMEOUT_MS", 15000)) * time.Millisecond,
		LogHTTPRetries:     utils.GetEnvAsBool("LOG_HTTP_RETRIES", false),
		DetailedGraph:      utils.GetEnvAsBool("DETAILED_GRAPH", false),
		PostsPerSubInGraph: utils.GetEnvAsInt("POSTS_PER_SUB_IN_GRAPH", 10),
		CommentsPerPost:    utils.GetEnvAsInt("COMMENTS_PER_POST_IN_GRAPH", 50),
		MaxAuthorLinks:     utils.GetEnvAsInt("MAX_AUTHOR_CONTENT_LINKS", 3),
		MaxPostsPerSub:     utils.GetEnvAsInt("MAX_POSTS_PER_SUB", 25),
		PostsSort:          strings.ToLower(strings.TrimSpace(os.Getenv("POSTS_SORT"))),
		PostsTimeFilter:    strings.ToLower(strings.TrimSpace(os.Getenv("POSTS_TIME_FILTER"))),
	}
	if cached.PostsSort == "" { cached.PostsSort = "top" }
	if cached.PostsTimeFilter == "" { cached.PostsTimeFilter = "day" }
	return cached
}

// ResetForTest clears cached config; for use in tests only.
func ResetForTest() { cached = nil }
