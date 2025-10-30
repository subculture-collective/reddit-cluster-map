package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGzip(t *testing.T) {
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"message":"test response that should be compressed"}`))
	})

	tests := []struct {
		name           string
		acceptEncoding string
		expectGzip     bool
	}{
		{
			name:           "with gzip support",
			acceptEncoding: "gzip",
			expectGzip:     true,
		},
		{
			name:           "with gzip and deflate support",
			acceptEncoding: "gzip, deflate",
			expectGzip:     true,
		},
		{
			name:           "without gzip support",
			acceptEncoding: "",
			expectGzip:     false,
		},
		{
			name:           "with only deflate support",
			acceptEncoding: "deflate",
			expectGzip:     false,
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
			if tt.expectGzip {
				if contentEncoding != "gzip" {
					t.Errorf("expected Content-Encoding: gzip, got %s", contentEncoding)
				}

				// Try to decompress the response
				gr, err := gzip.NewReader(rr.Body)
				if err != nil {
					t.Fatalf("failed to create gzip reader: %v", err)
				}
				defer gr.Close()

				body, err := io.ReadAll(gr)
				if err != nil {
					t.Fatalf("failed to read gzipped body: %v", err)
				}

				if !strings.Contains(string(body), "test response") {
					t.Error("decompressed body doesn't contain expected content")
				}
			} else {
				if contentEncoding == "gzip" {
					t.Error("did not expect Content-Encoding: gzip")
				}

				body := rr.Body.String()
				if !strings.Contains(body, "test response") {
					t.Error("body doesn't contain expected content")
				}
			}
		})
	}
}
