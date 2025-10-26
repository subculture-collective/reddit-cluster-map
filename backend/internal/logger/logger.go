package logger

import (
	"context"
	"log/slog"
	"os"
	"strings"
)

// ContextKey is a type for context keys used by the logger
type ContextKey string

const (
	// RequestIDKey is the context key for request IDs
	RequestIDKey ContextKey = "request_id"
)

var defaultLogger *slog.Logger

// Init initializes the global logger with the specified log level
func Init(levelStr string) {
	level := parseLevel(levelStr)
	
	// Determine output format based on environment
	var handler slog.Handler
	
	// Use JSON format in production, text format in development
	if os.Getenv("ENV") == "production" {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			Level: level,
		})
	} else {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: level,
		})
	}
	
	defaultLogger = slog.New(handler)
	slog.SetDefault(defaultLogger)
}

// parseLevel converts a string log level to slog.Level
func parseLevel(levelStr string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(levelStr)) {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// Get returns the default logger
func Get() *slog.Logger {
	if defaultLogger == nil {
		Init("info")
	}
	return defaultLogger
}

// WithRequestID returns a logger with the request ID from context
func WithRequestID(ctx context.Context) *slog.Logger {
	logger := Get()
	if reqID, ok := ctx.Value(RequestIDKey).(string); ok && reqID != "" {
		logger = logger.With("request_id", reqID)
	}
	return logger
}

// WithComponent returns a logger with a component label
func WithComponent(component string) *slog.Logger {
	return Get().With("component", component)
}

// WithFields returns a logger with additional fields
func WithFields(fields map[string]interface{}) *slog.Logger {
	logger := Get()
	for k, v := range fields {
		logger = logger.With(k, v)
	}
	return logger
}

// Debug logs a debug message
func Debug(msg string, args ...any) {
	Get().Debug(msg, args...)
}

// Info logs an info message
func Info(msg string, args ...any) {
	Get().Info(msg, args...)
}

// Warn logs a warning message
func Warn(msg string, args ...any) {
	Get().Warn(msg, args...)
}

// Error logs an error message
func Error(msg string, args ...any) {
	Get().Error(msg, args...)
}

// DebugContext logs a debug message with context
func DebugContext(ctx context.Context, msg string, args ...any) {
	WithRequestID(ctx).Debug(msg, args...)
}

// InfoContext logs an info message with context
func InfoContext(ctx context.Context, msg string, args ...any) {
	WithRequestID(ctx).Info(msg, args...)
}

// WarnContext logs a warning message with context
func WarnContext(ctx context.Context, msg string, args ...any) {
	WithRequestID(ctx).Warn(msg, args...)
}

// ErrorContext logs an error message with context
func ErrorContext(ctx context.Context, msg string, args ...any) {
	WithRequestID(ctx).Error(msg, args...)
}
