package middleware

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"
)

// MaxRequestBodySize is the maximum size of request bodies (10MB)
const MaxRequestBodySize = 10 * 1024 * 1024

// ValidateRequestBody returns a middleware that validates and limits request body size.
func ValidateRequestBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only validate POST, PUT, PATCH requests with a body
		if r.Method == "POST" || r.Method == "PUT" || r.Method == "PATCH" {
			// Limit request body size
			r.Body = http.MaxBytesReader(w, r.Body, MaxRequestBodySize)
		}
		next.ServeHTTP(w, r)
	})
}

// SanitizeInput provides input sanitization utilities.
type SanitizeInput struct{}

// SanitizeString removes potentially dangerous characters and limits length.
func (s *SanitizeInput) SanitizeString(input string, maxLength int) string {
	// Trim whitespace
	input = strings.TrimSpace(input)

	// Limit length
	if len(input) > maxLength {
		input = input[:maxLength]
	}

	// Ensure valid UTF-8
	if !utf8.ValidString(input) {
		// Remove invalid UTF-8 sequences
		input = strings.ToValidUTF8(input, "")
	}

	return input
}

// ValidateSubredditName validates a subreddit name.
func (s *SanitizeInput) ValidateSubredditName(name string) error {
	name = strings.TrimSpace(name)

	if name == "" {
		return fmt.Errorf("subreddit name cannot be empty")
	}

	if len(name) > 21 {
		return fmt.Errorf("subreddit name too long (max 21 characters)")
	}

	// Check for invalid characters
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_') {
			return fmt.Errorf("subreddit name contains invalid characters")
		}
	}

	return nil
}

// ValidateJSON validates that the request body is valid JSON.
func ValidateJSON(r *http.Request) error {
	contentType := r.Header.Get("Content-Type")
	if !strings.Contains(contentType, "application/json") {
		return fmt.Errorf("Content-Type must be application/json")
	}

	// Try to decode the body to check if it's valid JSON
	// We'll read it into a buffer to preserve it for later use
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return fmt.Errorf("failed to read request body: %w", err)
	}
	defer r.Body.Close()

	// Check if it's valid JSON
	var js json.RawMessage
	if err := json.Unmarshal(body, &js); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}

	// Restore the body for the actual handler
	r.Body = io.NopCloser(strings.NewReader(string(body)))

	return nil
}
