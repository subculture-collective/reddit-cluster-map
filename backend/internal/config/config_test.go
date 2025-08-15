package config

import (
	"os"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	// ensure defaults kick in with empty env
	os.Unsetenv("REDDIT_USER_AGENT")
	os.Unsetenv("HTTP_MAX_RETRIES")
	os.Unsetenv("HTTP_RETRY_BASE_MS")
	os.Unsetenv("DETAILED_GRAPH")
	os.Unsetenv("POSTS_PER_SUB_IN_GRAPH")
	os.Unsetenv("COMMENTS_PER_POST_IN_GRAPH")
	os.Unsetenv("MAX_AUTHOR_CONTENT_LINKS")

	cfg := Load()
	if cfg.UserAgent == "" {
		t.Fatalf("expected default UA, got empty")
	}
	if cfg.HTTPMaxRetries != 3 {
		t.Fatalf("expected default retries=3, got %d", cfg.HTTPMaxRetries)
	}
	if cfg.PostsPerSubInGraph != 10 || cfg.CommentsPerPost != 50 {
		t.Fatalf("unexpected defaults: posts=%d comments=%d", cfg.PostsPerSubInGraph, cfg.CommentsPerPost)
	}
	if cfg.MaxAuthorLinks != 3 {
		t.Fatalf("expected default MaxAuthorLinks=3, got %d", cfg.MaxAuthorLinks)
	}
}
