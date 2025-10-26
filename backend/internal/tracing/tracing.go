package tracing

import (
	"context"
	"fmt"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.4.0"
	"go.opentelemetry.io/otel/trace"
)

var tracer trace.Tracer

// Init initializes the OpenTelemetry tracing
func Init(serviceName string) (func(context.Context) error, error) {
	// Check if tracing is enabled
	if os.Getenv("OTEL_ENABLED") != "true" {
		// Return a no-op shutdown function
		return func(context.Context) error { return nil }, nil
	}

	ctx := context.Background()

	// Create OTLP HTTP exporter
	// Note: WithEndpoint expects "host:port" format without protocol scheme.
	// The protocol is determined by WithInsecure() (HTTP) vs WithTLSClientConfig() (HTTPS)
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		endpoint = "localhost:4318" // Default OTLP HTTP endpoint
	}

	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpoint(endpoint),
		otlptracehttp.WithInsecure(), // Use insecure for local development
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create trace exporter: %w", err)
	}

	// Create resource with service information
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String(serviceName),
			semconv.ServiceVersionKey.String(getVersion()),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	// Get sampling rate from environment (default 0.1 = 10%)
	samplingRate := 0.1
	if rate := os.Getenv("OTEL_TRACE_SAMPLE_RATE"); rate != "" {
		fmt.Sscanf(rate, "%f", &samplingRate)
	}

	// Create trace provider with sampling
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.TraceIDRatioBased(samplingRate)),
	)

	otel.SetTracerProvider(tp)
	tracer = tp.Tracer(serviceName)

	// Return shutdown function
	return func(ctx context.Context) error {
		ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		return tp.Shutdown(ctx)
	}, nil
}

// getVersion returns the service version from environment or default
func getVersion() string {
	if v := os.Getenv("SERVICE_VERSION"); v != "" {
		return v
	}
	return "dev"
}

// GetTracer returns the global tracer
func GetTracer() trace.Tracer {
	if tracer == nil {
		// Return a no-op tracer if not initialized
		return otel.Tracer("noop")
	}
	return tracer
}

// StartSpan starts a new span with the given name
func StartSpan(ctx context.Context, spanName string, opts ...trace.SpanStartOption) (context.Context, trace.Span) {
	return GetTracer().Start(ctx, spanName, opts...)
}
