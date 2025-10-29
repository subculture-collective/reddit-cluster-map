package errorreporting

import (
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/getsentry/sentry-go"
)

func TestScrubPII(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		contains    []string // strings that should be present after scrubbing
		notContains []string // strings that should be removed
	}{
		{
			name:        "email address",
			input:       "User email is test@example.com",
			contains:    []string{"User email is", "[REDACTED]"},
			notContains: []string{"test@example.com"},
		},
		{
			name:        "bearer token",
			input:       "Authorization: bearer abc123def456ghi789jkl",
			contains:    []string{"Authorization:", "[REDACTED]"},
			notContains: []string{"abc123def456ghi789jkl"},
		},
		{
			name:        "API key",
			input:       "api_key: sk_test_1234567890abcdef",
			contains:    []string{"[REDACTED]"},
			notContains: []string{"sk_test_1234567890abcdef"},
		},
		{
			name:        "IP address",
			input:       "Request from 192.168.1.1",
			contains:    []string{"Request from", "[REDACTED]"},
			notContains: []string{"192.168.1.1"},
		},
		{
			name:     "no PII",
			input:    "Normal log message without sensitive data",
			contains: []string{"Normal log message without sensitive data"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := scrubPII(tt.input)

			for _, s := range tt.contains {
				if !strings.Contains(result, s) {
					t.Errorf("Expected scrubbed text to contain %q, got: %s", s, result)
				}
			}

			for _, s := range tt.notContains {
				if strings.Contains(result, s) {
					t.Errorf("Expected scrubbed text to not contain %q, got: %s", s, result)
				}
			}
		})
	}
}

func TestGetRelease(t *testing.T) {
	// Test SENTRY_RELEASE
	os.Setenv("SENTRY_RELEASE", "v1.0.0")
	defer os.Unsetenv("SENTRY_RELEASE")

	release := getRelease()
	if release != "v1.0.0" {
		t.Errorf("Expected release 'v1.0.0', got %s", release)
	}

	// Test SERVICE_VERSION fallback
	os.Unsetenv("SENTRY_RELEASE")
	os.Setenv("SERVICE_VERSION", "v2.0.0")
	defer os.Unsetenv("SERVICE_VERSION")

	release = getRelease()
	if release != "v2.0.0" {
		t.Errorf("Expected release 'v2.0.0', got %s", release)
	}

	// Test default
	os.Unsetenv("SERVICE_VERSION")
	release = getRelease()
	if release != "dev" {
		t.Errorf("Expected release 'dev', got %s", release)
	}
}

func TestInit_NotConfigured(t *testing.T) {
	// Ensure SENTRY_DSN is not set
	os.Unsetenv("SENTRY_DSN")

	err := Init("test")
	if err != nil {
		t.Errorf("Init should not error when Sentry is not configured: %v", err)
	}
}

func TestInit_Configured(t *testing.T) {
	// Set a test DSN (won't actually send data)
	os.Setenv("SENTRY_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0")
	defer os.Unsetenv("SENTRY_DSN")

	err := Init("test")
	if err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	// Clean up
	sentry.Flush(0)
}

func TestBeforeSend(t *testing.T) {
	event := &sentry.Event{
		Message: "Error with email test@example.com",
		Exception: []sentry.Exception{
			{
				Value: "Exception with token: bearer abc123def456ghi789jkl",
			},
		},
		Extra: map[string]interface{}{
			"user_email": "admin@example.com",
		},
		Request: &sentry.Request{
			Headers: map[string]string{
				"Authorization": "Bearer secret-token",
				"X-Api-Key":     "api-key-123",
				"User-Agent":    "Mozilla/5.0",
			},
			QueryString: "token=secret123",
		},
	}

	result := beforeSend(event, nil)

	// Check message is scrubbed
	if strings.Contains(result.Message, "test@example.com") {
		t.Error("Email should be scrubbed from message")
	}

	// Check exception is scrubbed
	if strings.Contains(result.Exception[0].Value, "abc123def456ghi789jkl") {
		t.Error("Token should be scrubbed from exception")
	}

	// Check extra data is scrubbed
	if emailVal, ok := result.Extra["user_email"].(string); ok {
		if strings.Contains(emailVal, "admin@example.com") {
			t.Error("Email should be scrubbed from extra data")
		}
	}

	// Check sensitive headers are removed
	if result.Request.Headers["Authorization"] != "" {
		t.Error("Authorization header should be removed")
	}
	if result.Request.Headers["X-Api-Key"] != "" {
		t.Error("X-Api-Key header should be removed")
	}

	// Check non-sensitive headers are preserved
	if result.Request.Headers["User-Agent"] != "Mozilla/5.0" {
		t.Error("User-Agent header should be preserved")
	}

	// Check query string is removed
	if result.Request.QueryString != "" {
		t.Error("Query string should be removed")
	}
}

func TestCaptureError(t *testing.T) {
	// This test just ensures the function doesn't panic
	CaptureError(nil)
	CaptureError(errors.New("test error"))
}

func TestCaptureErrorWithContext(t *testing.T) {
	// This test just ensures the function doesn't panic
	CaptureErrorWithContext(
		errors.New("test error"),
		map[string]string{"tag1": "value1"},
		map[string]interface{}{"extra1": "value1"},
	)
}

func TestIsSentryEnabled(t *testing.T) {
	// Test when not configured
	os.Unsetenv("SENTRY_DSN")
	if IsSentryEnabled() {
		t.Error("IsSentryEnabled should return false when DSN is not set")
	}

	// Test when configured
	os.Setenv("SENTRY_DSN", "https://example@o0.ingest.sentry.io/0")
	defer os.Unsetenv("SENTRY_DSN")
	if !IsSentryEnabled() {
		t.Error("IsSentryEnabled should return true when DSN is set")
	}
}

func TestValidateDSN(t *testing.T) {
	tests := []struct {
		dsn       string
		expectErr bool
	}{
		{"https://examplePublicKey@o0.ingest.sentry.io/0", false},
		{"http://examplePublicKey@o0.ingest.sentry.io/0", false},
		{"invalid-dsn", true},
		{"", true},
	}

	for _, tt := range tests {
		t.Run(tt.dsn, func(t *testing.T) {
			err := ValidateDSN(tt.dsn)
			if tt.expectErr && err == nil {
				t.Error("Expected error but got nil")
			}
			if !tt.expectErr && err != nil {
				t.Errorf("Expected no error but got: %v", err)
			}
		})
	}
}

func TestScrubPIIExported(t *testing.T) {
	// Test the exported ScrubPII function
	input := "Email: test@example.com, Token: bearer abc123def456ghi789jkl"
	result := ScrubPII(input)

	if strings.Contains(result, "test@example.com") {
		t.Error("Email should be scrubbed")
	}

	if strings.Contains(result, "abc123def456ghi789jkl") {
		t.Error("Token should be scrubbed")
	}

	if !strings.Contains(result, "[REDACTED]") {
		t.Error("Should contain [REDACTED]")
	}
}
