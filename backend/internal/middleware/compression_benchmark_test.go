package middleware

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/andybalholm/brotli"
)

// TestCompressionRatio verifies that compression achieves >70% ratio
func TestCompressionRatio(t *testing.T) {
	// Simulate a large JSON graph response (similar to what /api/graph returns)
	var graphJSON strings.Builder
	graphJSON.WriteString(`{"nodes":[`)
	for i := 0; i < 1000; i++ {
		if i > 0 {
			graphJSON.WriteString(",")
		}
		graphJSON.WriteString(`{"id":"user_`)
		graphJSON.WriteString(strconv.Itoa(i))
		graphJSON.WriteString(`","name":"User `)
		graphJSON.WriteString(strconv.Itoa(i))
		graphJSON.WriteString(`","val":`)
		graphJSON.WriteString(strconv.Itoa(i))
		graphJSON.WriteString(`,"type":"user"}`)
	}
	graphJSON.WriteString(`],"links":[`)
	for i := 0; i < 2000; i++ {
		if i > 0 {
			graphJSON.WriteString(",")
		}
		graphJSON.WriteString(`{"source":"user_`)
		graphJSON.WriteString(strconv.Itoa(i % 1000))
		graphJSON.WriteString(`","target":"subreddit_`)
		graphJSON.WriteString(strconv.Itoa(i % 1000))
		graphJSON.WriteString(`"}`)
	}
	graphJSON.WriteString(`]}`)

	payload := graphJSON.String()
	uncompressedSize := len(payload)

	tests := []struct {
		name                string
		acceptEncoding      string
		expectedEncoding    string
		minCompressionRatio float64 // Minimum acceptable ratio (compressed/uncompressed)
	}{
		{
			name:                "gzip compression",
			acceptEncoding:      "gzip",
			expectedEncoding:    "gzip",
			minCompressionRatio: 0.30, // Should achieve <30% of original size (>70% reduction)
		},
		{
			name:                "brotli compression",
			acceptEncoding:      "br",
			expectedEncoding:    "br",
			minCompressionRatio: 0.25, // Brotli typically achieves better compression
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				w.Write([]byte(payload))
			}))

			req := httptest.NewRequest(http.MethodGet, "/api/graph", nil)
			req.Header.Set("Accept-Encoding", tt.acceptEncoding)
			rr := httptest.NewRecorder()

			handler.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Fatalf("expected status 200, got %d", rr.Code)
			}

			contentEncoding := rr.Header().Get("Content-Encoding")
			if contentEncoding != tt.expectedEncoding {
				t.Fatalf("expected Content-Encoding: %s, got %s", tt.expectedEncoding, contentEncoding)
			}

			compressedSize := rr.Body.Len()
			compressionRatio := float64(compressedSize) / float64(uncompressedSize)
			compressionPercent := (1.0 - compressionRatio) * 100

			t.Logf("Uncompressed size: %d bytes", uncompressedSize)
			t.Logf("Compressed size (%s): %d bytes", tt.expectedEncoding, compressedSize)
			t.Logf("Compression ratio: %.2f%% reduction", compressionPercent)

			// Verify we achieve the required compression ratio
			if compressionRatio > tt.minCompressionRatio {
				t.Errorf("compression ratio %.2f exceeds maximum %.2f (achieved only %.2f%% reduction, need >70%%)",
					compressionRatio, tt.minCompressionRatio, compressionPercent)
			}

			// Verify the compressed data can be decompressed correctly
			var body []byte
			var err error

			if tt.expectedEncoding == "gzip" {
				gr, err := gzip.NewReader(rr.Body)
				if err != nil {
					t.Fatalf("failed to create gzip reader: %v", err)
				}
				defer gr.Close()
				body, err = io.ReadAll(gr)
				if err != nil {
					t.Fatalf("failed to read gzipped body: %v", err)
				}
			} else if tt.expectedEncoding == "br" {
				br := brotli.NewReader(rr.Body)
				body, err = io.ReadAll(br)
				if err != nil {
					t.Fatalf("failed to read brotli body: %v", err)
				}
			}

			if string(body) != payload {
				t.Error("decompressed body doesn't match original payload")
			}
		})
	}
}

// BenchmarkGzipCompression benchmarks gzip compression performance
func BenchmarkGzipCompression(b *testing.B) {
	// Create a large sample payload
	var buf bytes.Buffer
	buf.WriteString(`{"nodes":[`)
	for i := 0; i < 10000; i++ {
		if i > 0 {
			buf.WriteString(",")
		}
		buf.WriteString(`{"id":"n`)
		buf.WriteString(strconv.Itoa(i))
		buf.WriteString(`","name":"Node `)
		buf.WriteString(strconv.Itoa(i))
		buf.WriteString(`","val":100}`)
	}
	buf.WriteString(`],"links":[]}`)
	payload := buf.Bytes()

	handler := Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(payload)
	}))

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Accept-Encoding", "gzip")
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
	}
}

// BenchmarkBrotliCompression benchmarks brotli compression performance
func BenchmarkBrotliCompression(b *testing.B) {
	// Create a large sample payload
	var buf bytes.Buffer
	buf.WriteString(`{"nodes":[`)
	for i := 0; i < 10000; i++ {
		if i > 0 {
			buf.WriteString(",")
		}
		buf.WriteString(`{"id":"n`)
		buf.WriteString(strconv.Itoa(i))
		buf.WriteString(`","name":"Node `)
		buf.WriteString(strconv.Itoa(i))
		buf.WriteString(`","val":100}`)
	}
	buf.WriteString(`],"links":[]}`)
	payload := buf.Bytes()

	handler := Gzip(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(payload)
	}))

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Accept-Encoding", "br")
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
	}
}
