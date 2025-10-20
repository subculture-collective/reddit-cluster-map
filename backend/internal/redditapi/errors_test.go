package redditapi

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestClassifyError_RateLimited(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusTooManyRequests,
		Body:       io.NopCloser(strings.NewReader("")),
	}

	err := ClassifyError(resp)
	if err.Type != ErrorRateLimited {
		t.Errorf("Expected ErrorRateLimited, got %v", err.Type)
	}
	if !err.Retryable {
		t.Error("Expected rate limit error to be retryable")
	}
}

func TestClassifyError_PrivateSubreddit(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusNotFound,
		Body:       io.NopCloser(strings.NewReader(`{"reason": "private"}`)),
	}

	err := ClassifyError(resp)
	if err.Type != ErrorPrivateSubreddit {
		t.Errorf("Expected ErrorPrivateSubreddit, got %v", err.Type)
	}
	if err.Retryable {
		t.Error("Expected private subreddit error to not be retryable")
	}
}

func TestClassifyError_BannedSubreddit(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusNotFound,
		Body:       io.NopCloser(strings.NewReader(`{"reason": "banned"}`)),
	}

	err := ClassifyError(resp)
	if err.Type != ErrorBannedSubreddit {
		t.Errorf("Expected ErrorBannedSubreddit, got %v", err.Type)
	}
	if err.Retryable {
		t.Error("Expected banned subreddit error to not be retryable")
	}
}

func TestClassifyError_Quarantined(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusForbidden,
		Body:       io.NopCloser(strings.NewReader(`{"reason": "quarantined"}`)),
	}

	err := ClassifyError(resp)
	if err.Type != ErrorQuarantined {
		t.Errorf("Expected ErrorQuarantined, got %v", err.Type)
	}
	if err.Retryable {
		t.Error("Expected quarantined error to not be retryable")
	}
}

func TestClassifyError_ServerError(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusInternalServerError,
		Body:       io.NopCloser(strings.NewReader("")),
	}

	err := ClassifyError(resp)
	if err.Type != ErrorServerError {
		t.Errorf("Expected ErrorServerError, got %v", err.Type)
	}
	if !err.Retryable {
		t.Error("Expected server error to be retryable")
	}
}

func TestClassifyError_Unauthorized(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusUnauthorized,
		Body:       io.NopCloser(strings.NewReader("")),
	}

	err := ClassifyError(resp)
	if err.Type != ErrorUnauthorized {
		t.Errorf("Expected ErrorUnauthorized, got %v", err.Type)
	}
	if !err.Retryable {
		t.Error("Expected unauthorized error to be retryable (token refresh)")
	}
}

func TestIsPermanent(t *testing.T) {
	tests := []struct {
		name      string
		errType   ErrorType
		permanent bool
	}{
		{"Private subreddit", ErrorPrivateSubreddit, true},
		{"Banned subreddit", ErrorBannedSubreddit, true},
		{"Quarantined", ErrorQuarantined, true},
		{"Not found", ErrorNotFound, true},
		{"Bad request", ErrorBadRequest, true},
		{"Forbidden", ErrorForbidden, true},
		{"Rate limited", ErrorRateLimited, false},
		{"Server error", ErrorServerError, false},
		{"Unauthorized", ErrorUnauthorized, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := &APIError{Type: tt.errType}
			if IsPermanent(err) != tt.permanent {
				t.Errorf("Expected IsPermanent to be %v for %s", tt.permanent, tt.name)
			}
		})
	}
}
