package crawler

import (
	"context"
	"net/http"

	"github.com/onnwee/reddit-cluster-map/backend/internal/config"
	"github.com/onnwee/reddit-cluster-map/backend/internal/httpx"
)

var httpClient = &http.Client{Timeout: config.Load().HTTPTimeout}

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
