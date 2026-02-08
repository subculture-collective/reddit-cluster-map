package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/andybalholm/brotli"
)

func TestGzip(t *testing.T) {
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"message":"test response that should be compressed"}`))
	})

	tests := []struct {
		name             string
		acceptEncoding   string
		expectEncoding   string
		expectCompressed bool
	}{
		{
			name:             "with gzip support",
			acceptEncoding:   "gzip",
			expectEncoding:   "gzip",
			expectCompressed: true,
		},
		{
			name:             "with gzip and deflate support",
			acceptEncoding:   "gzip, deflate",
			expectEncoding:   "gzip",
			expectCompressed: true,
		},
		{
			name:             "with brotli support",
			acceptEncoding:   "br",
			expectEncoding:   "br",
			expectCompressed: true,
		},
		{
			name:             "with brotli and gzip support (prefer brotli)",
			acceptEncoding:   "br, gzip",
			expectEncoding:   "br",
			expectCompressed: true,
		},
		{
			name:             "with gzip and brotli support (prefer brotli)",
			acceptEncoding:   "gzip, br",
			expectEncoding:   "br",
			expectCompressed: true,
		},
		{
			name:             "without compression support",
			acceptEncoding:   "",
			expectEncoding:   "",
			expectCompressed: false,
		},
		{
			name:             "with only deflate support",
			acceptEncoding:   "deflate",
			expectEncoding:   "",
			expectCompressed: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := Gzip(testHandler)
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			if tt.acceptEncoding != "" {
				req.Header.Set("Accept-Encoding", tt.acceptEncoding)
			}
			rr := httptest.NewRecorder()

			handler.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Errorf("expected status 200, got %d", rr.Code)
			}

			contentEncoding := rr.Header().Get("Content-Encoding")
			if tt.expectCompressed {
				if contentEncoding != tt.expectEncoding {
					t.Errorf("expected Content-Encoding: %s, got %s", tt.expectEncoding, contentEncoding)
				}

				var body []byte
				var err error

				// Decompress based on encoding
				if tt.expectEncoding == "gzip" {
					gr, err := gzip.NewReader(rr.Body)
					if err != nil {
						t.Fatalf("failed to create gzip reader: %v", err)
					}
					defer gr.Close()

					body, err = io.ReadAll(gr)
					if err != nil {
						t.Fatalf("failed to read gzipped body: %v", err)
					}
				} else if tt.expectEncoding == "br" {
					br := brotli.NewReader(rr.Body)
					body, err = io.ReadAll(br)
					if err != nil {
						t.Fatalf("failed to read brotli body: %v", err)
					}
				}

				if !strings.Contains(string(body), "test response") {
					t.Error("decompressed body doesn't contain expected content")
				}
			} else {
				if contentEncoding != "" {
					t.Errorf("did not expect Content-Encoding, got %s", contentEncoding)
				}

				body := rr.Body.String()
				if !strings.Contains(body, "test response") {
					t.Error("body doesn't contain expected content")
				}
			}
		})
	}
}
