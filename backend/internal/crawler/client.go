package crawler

import (
	"context"
	"net/http"

	"github.com/onnwee/reddit-cluster-map/backend/internal/config"
	"github.com/onnwee/reddit-cluster-map/backend/internal/httpx"
)

var httpClient = &http.Client{Timeout: config.Load().HTTPTimeout}

// authenticatedGet issues a GET with OAuth Bearer token and Reddit-compliant User-Agent.
// It uses DoWithRetryFactory which applies light retries and a pre-attempt hook
// wired to waitForRateLimit() so we never exceed our global pacing.
var authenticatedGet = func(url string) (*http.Response, error) {
	token, err := getAccessToken()
	if err != nil {
		return nil, err
	}
	ua := config.Load().UserAgent
	build := func() (*http.Request, error) {
		req, _ := http.NewRequest("GET", url, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("User-Agent", ua)
		return req, nil
	}
	pre := func(ctx context.Context, attempt int) error { waitForRateLimit(); return nil }
	return httpx.DoWithRetryFactory(httpClient, build, pre)
}

// unauthenticatedGet performs a GET without OAuth, but with Reddit-compliant User-Agent and retries.
var unauthenticatedGet = func(url string) (*http.Response, error) {
	ua := config.Load().UserAgent
	build := func() (*http.Request, error) {
		req, _ := http.NewRequest("GET", url, nil)
		req.Header.Set("User-Agent", ua)
		return req, nil
	}
	pre := func(ctx context.Context, attempt int) error { waitForRateLimit(); return nil }
	return httpx.DoWithRetryFactory(httpClient, build, pre)
}
