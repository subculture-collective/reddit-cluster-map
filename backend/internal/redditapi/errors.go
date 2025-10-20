package redditapi

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

// ErrorType represents different types of Reddit API errors
type ErrorType int

const (
	ErrorUnknown ErrorType = iota
	ErrorRateLimited
	ErrorNotFound
	ErrorForbidden
	ErrorServerError
	ErrorBadRequest
	ErrorUnauthorized
	ErrorPrivateSubreddit
	ErrorBannedSubreddit
	ErrorQuarantined
)

// APIError represents a Reddit API error with additional context
type APIError struct {
	Type       ErrorType
	StatusCode int
	Message    string
	Retryable  bool
}

func (e *APIError) Error() string {
	return e.Message
}

// RedditErrorResponse represents the JSON structure of Reddit error responses
type RedditErrorResponse struct {
	Message string `json:"message"`
	Error   int    `json:"error"`
	Reason  string `json:"reason"`
}

// ClassifyError determines the type of error from an HTTP response
func ClassifyError(resp *http.Response) *APIError {
	if resp == nil {
		return &APIError{
			Type:      ErrorUnknown,
			Message:   "nil response",
			Retryable: false,
		}
	}

	// Read and parse response body for additional context
	var bodyText string
	var redditErr RedditErrorResponse
	if resp.Body != nil {
		bodyBytes, err := io.ReadAll(resp.Body)
		if err == nil {
			bodyText = string(bodyBytes)
			// Try to parse as Reddit error JSON
			_ = json.Unmarshal(bodyBytes, &redditErr)
		}
		// Note: Body is already read, caller should not try to read it again
	}

	apiErr := &APIError{
		StatusCode: resp.StatusCode,
		Type:       ErrorUnknown,
		Retryable:  false,
	}

	switch resp.StatusCode {
	case http.StatusTooManyRequests:
		apiErr.Type = ErrorRateLimited
		apiErr.Message = "rate limited by Reddit API"
		apiErr.Retryable = true

	case http.StatusNotFound:
		apiErr.Type = ErrorNotFound
		apiErr.Message = "resource not found (404)"
		apiErr.Retryable = false

		// Check for specific Reddit error patterns
		if strings.Contains(bodyText, "private") || redditErr.Reason == "private" {
			apiErr.Type = ErrorPrivateSubreddit
			apiErr.Message = "subreddit is private"
		} else if strings.Contains(bodyText, "banned") || redditErr.Reason == "banned" {
			apiErr.Type = ErrorBannedSubreddit
			apiErr.Message = "subreddit is banned"
		}

	case http.StatusForbidden:
		apiErr.Type = ErrorForbidden
		apiErr.Message = "forbidden (403)"
		apiErr.Retryable = false

		// Check for quarantined subreddit
		if strings.Contains(bodyText, "quarantined") || redditErr.Reason == "quarantined" {
			apiErr.Type = ErrorQuarantined
			apiErr.Message = "subreddit is quarantined"
		}

	case http.StatusUnauthorized:
		apiErr.Type = ErrorUnauthorized
		apiErr.Message = "unauthorized (401) - token may be expired"
		apiErr.Retryable = true // OAuth token refresh might help

	case http.StatusBadRequest:
		apiErr.Type = ErrorBadRequest
		apiErr.Message = "bad request (400)"
		apiErr.Retryable = false

	case http.StatusInternalServerError, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		apiErr.Type = ErrorServerError
		apiErr.Message = "Reddit server error (5xx)"
		apiErr.Retryable = true

	default:
		if resp.StatusCode >= 500 {
			apiErr.Type = ErrorServerError
			apiErr.Message = "server error"
			apiErr.Retryable = true
		} else if resp.StatusCode >= 400 {
			apiErr.Type = ErrorBadRequest
			apiErr.Message = "client error"
			apiErr.Retryable = false
		}
	}

	// Add Reddit-specific message if available
	if redditErr.Message != "" {
		apiErr.Message += ": " + redditErr.Message
	} else if redditErr.Reason != "" {
		apiErr.Message += ": " + redditErr.Reason
	}

	return apiErr
}

// IsRetryable checks if an error should be retried
func IsRetryable(err *APIError) bool {
	return err != nil && err.Retryable
}

// IsPermanent checks if an error is permanent (should not be retried)
func IsPermanent(err *APIError) bool {
	if err == nil {
		return false
	}
	return err.Type == ErrorNotFound ||
		err.Type == ErrorPrivateSubreddit ||
		err.Type == ErrorBannedSubreddit ||
		err.Type == ErrorQuarantined ||
		err.Type == ErrorBadRequest ||
		err.Type == ErrorForbidden
}
