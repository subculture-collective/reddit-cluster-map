package errorreporting

import (
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/getsentry/sentry-go"
)

// PII patterns to scrub from error messages
var piiPatterns = []*regexp.Regexp{
	// Email addresses
	regexp.MustCompile(`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`),
	// Reddit tokens (OAuth tokens typically 20+ chars)
	regexp.MustCompile(`bearer\s+[a-zA-Z0-9_-]{20,}`),
	// API keys and tokens
	regexp.MustCompile(`(?i)(api[_-]?key|token|secret)["\s:=]+[a-zA-Z0-9_-]{16,}`),
	// IP addresses
	regexp.MustCompile(`\b(?:\d{1,3}\.){3}\d{1,3}\b`),
	// Credit card numbers (basic pattern)
	regexp.MustCompile(`\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b`),
}

// Init initializes Sentry error reporting
func Init(environment string) error {
	dsn := os.Getenv("SENTRY_DSN")
	if dsn == "" {
		// Sentry is not configured, return without error
		return nil
	}

	sampleRate := 1.0
	if os.Getenv("ENV") == "production" {
		sampleRate = 0.1 // Sample 10% in production
	}

	err := sentry.Init(sentry.ClientOptions{
		Dsn:              dsn,
		Environment:      environment,
		Release:          getRelease(),
		TracesSampleRate: sampleRate,
		BeforeSend:       beforeSend,
		AttachStacktrace: true,
	})

	if err != nil {
		return fmt.Errorf("failed to initialize Sentry: %w", err)
	}

	return nil
}

// getRelease returns the release version from environment or default
func getRelease() string {
	if release := os.Getenv("SENTRY_RELEASE"); release != "" {
		return release
	}
	if version := os.Getenv("SERVICE_VERSION"); version != "" {
		return version
	}
	return "dev"
}

// beforeSend is called before sending events to Sentry
// It scrubs PII and sanitizes sensitive data
func beforeSend(event *sentry.Event, hint *sentry.EventHint) *sentry.Event {
	// Scrub PII from exception messages
	if event.Exception != nil {
		for i := range event.Exception {
			event.Exception[i].Value = scrubPII(event.Exception[i].Value)
		}
	}

	// Scrub PII from message
	if event.Message != "" {
		event.Message = scrubPII(event.Message)
	}

	// Scrub PII from extra data
	if event.Extra != nil {
		for key, value := range event.Extra {
			if str, ok := value.(string); ok {
				event.Extra[key] = scrubPII(str)
			}
		}
	}

	// Remove sensitive request data
	if event.Request != nil {
		// Remove authorization headers
		if event.Request.Headers != nil {
			delete(event.Request.Headers, "Authorization")
			delete(event.Request.Headers, "Cookie")
			delete(event.Request.Headers, "X-Api-Key")
		}
		// Remove query strings that might contain tokens
		event.Request.QueryString = ""
	}

	return event
}

// scrubPII removes personally identifiable information from strings
func scrubPII(text string) string {
	result := text
	for _, pattern := range piiPatterns {
		result = pattern.ReplaceAllString(result, "[REDACTED]")
	}
	return result
}

// CaptureError captures an error and sends it to Sentry
func CaptureError(err error) {
	if err == nil {
		return
	}
	sentry.CaptureException(err)
}

// CaptureErrorWithContext captures an error with additional context
func CaptureErrorWithContext(err error, tags map[string]string, extras map[string]interface{}) {
	if err == nil {
		return
	}

	sentry.WithScope(func(scope *sentry.Scope) {
		// Add tags
		for k, v := range tags {
			scope.SetTag(k, v)
		}

		// Add extra data (will be scrubbed by beforeSend)
		for k, v := range extras {
			scope.SetExtra(k, v)
		}

		sentry.CaptureException(err)
	})
}

// CaptureMessage captures a message without an error
func CaptureMessage(message string, level sentry.Level) {
	sentry.CaptureMessage(message)
}

// Flush waits for all events to be sent to Sentry
func Flush(timeout time.Duration) bool {
	return sentry.Flush(timeout)
}

// SetUser sets user information for error context
func SetUser(userID, username string) {
	sentry.ConfigureScope(func(scope *sentry.Scope) {
		scope.SetUser(sentry.User{
			ID:       userID,
			Username: username,
		})
	})
}

// SetTag sets a tag for all subsequent events
func SetTag(key, value string) {
	sentry.ConfigureScope(func(scope *sentry.Scope) {
		scope.SetTag(key, value)
	})
}

// AddBreadcrumb adds a breadcrumb for debugging context
func AddBreadcrumb(category, message string, level sentry.Level) {
	sentry.AddBreadcrumb(&sentry.Breadcrumb{
		Category:  category,
		Message:   message,
		Level:     level,
		Timestamp: time.Now(),
	})
}

// ScrubPII exposes the PII scrubbing function for external use
func ScrubPII(text string) string {
	return scrubPII(text)
}

// IsSentryEnabled returns true if Sentry is configured
func IsSentryEnabled() bool {
	return os.Getenv("SENTRY_DSN") != ""
}

// ValidateDSN checks if the provided DSN is valid
func ValidateDSN(dsn string) error {
	if !strings.HasPrefix(dsn, "https://") && !strings.HasPrefix(dsn, "http://") {
		return fmt.Errorf("invalid Sentry DSN format")
	}
	return nil
}
