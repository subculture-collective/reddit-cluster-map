package logger

import (
	"bytes"
	"context"
	"log/slog"
	"os"
	"strings"
	"testing"
)

func TestParseLevel(t *testing.T) {
	tests := []struct {
		input    string
		expected slog.Level
	}{
		{"debug", slog.LevelDebug},
		{"DEBUG", slog.LevelDebug},
		{"info", slog.LevelInfo},
		{"INFO", slog.LevelInfo},
		{"warn", slog.LevelWarn},
		{"warning", slog.LevelWarn},
		{"error", slog.LevelError},
		{"ERROR", slog.LevelError},
		{"invalid", slog.LevelInfo}, // default
		{"", slog.LevelInfo},        // default
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := parseLevel(tt.input)
			if result != tt.expected {
				t.Errorf("parseLevel(%q) = %v, want %v", tt.input, result, tt.expected)
			}
		})
	}
}

func TestInit(t *testing.T) {
	// Reset defaultLogger
	defaultLogger = nil

	// Test initialization
	Init("debug")

	if defaultLogger == nil {
		t.Fatal("defaultLogger should not be nil after Init")
	}

	// Reset for other tests
	defaultLogger = nil
}

func TestGet(t *testing.T) {
	// Reset defaultLogger
	defaultLogger = nil

	logger := Get()
	if logger == nil {
		t.Fatal("Get() should return a logger")
	}

	// Second call should return the same instance
	logger2 := Get()
	if logger != logger2 {
		t.Error("Get() should return the same logger instance")
	}

	// Reset
	defaultLogger = nil
}

func TestWithRequestID(t *testing.T) {
	// Reset and initialize
	defaultLogger = nil
	Init("info")

	// Context without request ID
	ctx := context.Background()
	logger := WithRequestID(ctx)
	if logger == nil {
		t.Fatal("WithRequestID should return a logger")
	}

	// Context with request ID
	ctxWithID := context.WithValue(context.Background(), RequestIDKey, "test-request-id")
	loggerWithID := WithRequestID(ctxWithID)
	if loggerWithID == nil {
		t.Fatal("WithRequestID should return a logger with request ID")
	}

	// Reset
	defaultLogger = nil
}

func TestWithComponent(t *testing.T) {
	// Reset and initialize
	defaultLogger = nil
	Init("info")

	logger := WithComponent("test-component")
	if logger == nil {
		t.Fatal("WithComponent should return a logger")
	}

	// Reset
	defaultLogger = nil
}

func TestWithFields(t *testing.T) {
	// Reset and initialize
	defaultLogger = nil
	Init("info")

	fields := map[string]interface{}{
		"key1": "value1",
		"key2": 123,
	}

	logger := WithFields(fields)
	if logger == nil {
		t.Fatal("WithFields should return a logger")
	}

	// Reset
	defaultLogger = nil
}

func TestLoggingFunctions(t *testing.T) {
	// Reset and initialize
	defaultLogger = nil

	// Capture output
	var buf bytes.Buffer
	handler := slog.NewTextHandler(&buf, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	})
	defaultLogger = slog.New(handler)

	// Test basic logging functions
	Debug("debug message", "key", "value")
	if !strings.Contains(buf.String(), "debug message") {
		t.Error("Debug message not logged")
	}
	buf.Reset()

	Info("info message")
	if !strings.Contains(buf.String(), "info message") {
		t.Error("Info message not logged")
	}
	buf.Reset()

	Warn("warn message")
	if !strings.Contains(buf.String(), "warn message") {
		t.Error("Warn message not logged")
	}
	buf.Reset()

	Error("error message")
	if !strings.Contains(buf.String(), "error message") {
		t.Error("Error message not logged")
	}

	// Reset
	defaultLogger = nil
}

func TestContextLoggingFunctions(t *testing.T) {
	// Reset and initialize
	defaultLogger = nil

	// Capture output
	var buf bytes.Buffer
	handler := slog.NewTextHandler(&buf, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	})
	defaultLogger = slog.New(handler)

	ctx := context.WithValue(context.Background(), RequestIDKey, "test-req-id")

	// Test context logging functions
	DebugContext(ctx, "debug message")
	if !strings.Contains(buf.String(), "debug message") {
		t.Error("DebugContext message not logged")
	}
	if !strings.Contains(buf.String(), "test-req-id") {
		t.Error("Request ID not included in log")
	}
	buf.Reset()

	InfoContext(ctx, "info message")
	if !strings.Contains(buf.String(), "info message") {
		t.Error("InfoContext message not logged")
	}
	buf.Reset()

	WarnContext(ctx, "warn message")
	if !strings.Contains(buf.String(), "warn message") {
		t.Error("WarnContext message not logged")
	}
	buf.Reset()

	ErrorContext(ctx, "error message")
	if !strings.Contains(buf.String(), "error message") {
		t.Error("ErrorContext message not logged")
	}

	// Reset
	defaultLogger = nil
}

func TestJSONFormat(t *testing.T) {
	// Reset and set production environment
	defaultLogger = nil
	os.Setenv("ENV", "production")
	defer os.Unsetenv("ENV")

	Init("info")

	if defaultLogger == nil {
		t.Fatal("Logger should be initialized")
	}

	// Reset
	defaultLogger = nil
}
