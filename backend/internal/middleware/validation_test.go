package middleware

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidateRequestBody(t *testing.T) {
	handler := ValidateRequestBody(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Test GET request (should pass through)
	req := httptest.NewRequest("GET", "/test", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("GET request should pass: got %d, want %d", rr.Code, http.StatusOK)
	}

	// Test POST request with small body (should pass)
	smallBody := bytes.NewBufferString(`{"test":"data"}`)
	req2 := httptest.NewRequest("POST", "/test", smallBody)
	rr2 := httptest.NewRecorder()
	handler.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Errorf("POST with small body should pass: got %d, want %d", rr2.Code, http.StatusOK)
	}
}

func TestSanitizeInput_SanitizeString(t *testing.T) {
	sanitizer := &SanitizeInput{}

	tests := []struct {
		input     string
		maxLength int
		expected  string
	}{
		{"  hello world  ", 20, "hello world"},
		{"verylongstringthatexceedslimit", 10, "verylongst"},
		{"normal text", 50, "normal text"},
		{"", 10, ""},
		{"   ", 10, ""},
	}

	for _, tt := range tests {
		result := sanitizer.SanitizeString(tt.input, tt.maxLength)
		if result != tt.expected {
			t.Errorf("SanitizeString(%q, %d) = %q, want %q", tt.input, tt.maxLength, result, tt.expected)
		}
	}
}

func TestSanitizeInput_ValidateSubredditName(t *testing.T) {
	sanitizer := &SanitizeInput{}

	validNames := []string{
		"AskReddit",
		"golang",
		"test123",
		"my_subreddit",
		"a",
		"Sub123_test",
	}

	for _, name := range validNames {
		if err := sanitizer.ValidateSubredditName(name); err != nil {
			t.Errorf("ValidateSubredditName(%q) should be valid, got error: %v", name, err)
		}
	}

	invalidNames := []struct {
		name        string
		shouldError bool
	}{
		{"", true},                         // empty
		{"   ", true},                      // whitespace only
		{"subreddit with spaces", true},    // spaces
		{"sub/reddit", true},               // slash
		{"sub\\reddit", true},              // backslash
		{"verylongsubredditname123", true}, // too long (>21)
		{"sub-reddit", true},               // hyphen not allowed
		{"sub.reddit", true},               // dot not allowed
		{"sub@reddit", true},               // special char
	}

	for _, tt := range invalidNames {
		err := sanitizer.ValidateSubredditName(tt.name)
		if tt.shouldError && err == nil {
			t.Errorf("ValidateSubredditName(%q) should return error", tt.name)
		}
	}
}

func TestValidateJSON(t *testing.T) {
	// Valid JSON
	validJSON := `{"key":"value","number":123}`
	req1 := httptest.NewRequest("POST", "/test", strings.NewReader(validJSON))
	req1.Header.Set("Content-Type", "application/json")
	if err := ValidateJSON(req1); err != nil {
		t.Errorf("ValidateJSON should accept valid JSON, got error: %v", err)
	}

	// Invalid JSON
	invalidJSON := `{key:value}`
	req2 := httptest.NewRequest("POST", "/test", strings.NewReader(invalidJSON))
	req2.Header.Set("Content-Type", "application/json")
	if err := ValidateJSON(req2); err == nil {
		t.Error("ValidateJSON should reject invalid JSON")
	}

	// Wrong content type
	req3 := httptest.NewRequest("POST", "/test", strings.NewReader(validJSON))
	req3.Header.Set("Content-Type", "text/plain")
	if err := ValidateJSON(req3); err == nil {
		t.Error("ValidateJSON should reject non-JSON content type")
	}
}

func TestSanitizeInput_UTF8Validation(t *testing.T) {
	sanitizer := &SanitizeInput{}

	// Valid UTF-8
	validUTF8 := "Hello 世界"
	result := sanitizer.SanitizeString(validUTF8, 100)
	if result != validUTF8 {
		t.Errorf("Valid UTF-8 should be preserved: got %q, want %q", result, validUTF8)
	}

	// Test with emoji
	emoji := "Hello 👋 World 🌍"
	result2 := sanitizer.SanitizeString(emoji, 100)
	if result2 != emoji {
		t.Errorf("Emoji should be preserved: got %q, want %q", result2, emoji)
	}
}

func TestSanitizeInput_MaxLength(t *testing.T) {
	sanitizer := &SanitizeInput{}

	input := "This is a very long string that should be truncated"
	maxLen := 10

	result := sanitizer.SanitizeString(input, maxLen)
	if len(result) > maxLen {
		t.Errorf("String should be truncated to %d chars, got %d", maxLen, len(result))
	}
}
