package tracing

import (
	"context"
	"os"
	"testing"

	"go.opentelemetry.io/otel"
)

func TestInit_Disabled(t *testing.T) {
	// Ensure OTEL_ENABLED is not set
	os.Unsetenv("OTEL_ENABLED")

	shutdown, err := Init("test-service")
	if err != nil {
		t.Fatalf("Init should not error when disabled: %v", err)
	}

	if shutdown == nil {
		t.Fatal("Shutdown function should not be nil")
	}

	// Test shutdown function
	if err := shutdown(context.Background()); err != nil {
		t.Errorf("Shutdown should not error: %v", err)
	}
}

func TestInit_Enabled(t *testing.T) {
	// Set OTEL_ENABLED to true
	os.Setenv("OTEL_ENABLED", "true")
	defer os.Unsetenv("OTEL_ENABLED")

	// Set a mock endpoint (this will fail to connect, but that's ok for testing initialization)
	os.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "localhost:14318")
	defer os.Unsetenv("OTEL_EXPORTER_OTLP_ENDPOINT")

	shutdown, err := Init("test-service")
	if err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	if shutdown == nil {
		t.Fatal("Shutdown function should not be nil")
	}

	// Clean up
	if err := shutdown(context.Background()); err != nil {
		t.Logf("Shutdown error (expected in test): %v", err)
	}
}

func TestGetVersion(t *testing.T) {
	// Test default version
	os.Unsetenv("SERVICE_VERSION")
	version := getVersion()
	if version != "dev" {
		t.Errorf("Expected default version 'dev', got %s", version)
	}

	// Test custom version
	os.Setenv("SERVICE_VERSION", "1.2.3")
	defer os.Unsetenv("SERVICE_VERSION")
	version = getVersion()
	if version != "1.2.3" {
		t.Errorf("Expected version '1.2.3', got %s", version)
	}
}

func TestGetTracer(t *testing.T) {
	tracer := GetTracer()
	if tracer == nil {
		t.Fatal("GetTracer should not return nil")
	}
}

func TestStartSpan(t *testing.T) {
	// Reset tracer to test no-op behavior
	tracer = nil

	ctx := context.Background()
	spanCtx, span := StartSpan(ctx, "test-span")

	if spanCtx == nil {
		t.Fatal("StartSpan should return a context")
	}

	if span == nil {
		t.Fatal("StartSpan should return a span")
	}

	// End the span
	span.End()
}

func TestStartSpan_WithInitializedTracer(t *testing.T) {
	// Initialize with disabled tracing
	os.Unsetenv("OTEL_ENABLED")
	shutdown, err := Init("test-service")
	if err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	defer shutdown(context.Background())

	ctx := context.Background()
	spanCtx, span := StartSpan(ctx, "test-span")

	if spanCtx == nil {
		t.Fatal("StartSpan should return a context")
	}

	if span == nil {
		t.Fatal("StartSpan should return a span")
	}

	span.End()

	// Reset
	tracer = nil
	otel.SetTracerProvider(nil)
}
