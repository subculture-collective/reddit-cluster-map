package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestSearchEndpointRegistered verifies the search endpoint is registered.
// This test only validates route registration; handler functionality
// is comprehensively tested in the handlers package.
func TestSearchEndpointRegistered(t *testing.T) {
	router := NewRouter(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/search", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	// A 404 means the route doesn't exist; any other status (even 500)
	// means the route is registered and we reached the handler
	if rr.Code == http.StatusNotFound {
		t.Error("search endpoint not registered")
	}
}

// TestExportEndpointRegistered verifies the export endpoint is registered.
// This test only validates route registration; handler functionality
// is comprehensively tested in the handlers package.
func TestExportEndpointRegistered(t *testing.T) {
	router := NewRouter(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/export", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	// A 404 means the route doesn't exist; any other status means registered
	if rr.Code == http.StatusNotFound {
		t.Error("export endpoint not registered")
	}
}

// TestGraphEndpointCompression verifies the graph endpoint supports compression.
func TestGraphEndpointCompression(t *testing.T) {
	router := NewRouter(nil)

	tests := []struct {
		name           string
		acceptEncoding string
		expectEncoding string
	}{
		{
			name:           "with brotli support",
			acceptEncoding: "br",
			expectEncoding: "br",
		},
		{
			name:           "with gzip support",
			acceptEncoding: "gzip",
			expectEncoding: "gzip",
		},
		{
			name:           "with brotli and gzip (prefer brotli)",
			acceptEncoding: "br, gzip",
			expectEncoding: "br",
		},
		{
			name:           "without compression",
			acceptEncoding: "",
			expectEncoding: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/graph", nil)
			if tt.acceptEncoding != "" {
				req.Header.Set("Accept-Encoding", tt.acceptEncoding)
			}
			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)

			// Endpoint should be registered (not 404)
			if rr.Code == http.StatusNotFound {
				t.Error("graph endpoint not registered")
			}

			// Check Content-Encoding header
			contentEncoding := rr.Header().Get("Content-Encoding")
			if contentEncoding != tt.expectEncoding {
				t.Errorf("expected Content-Encoding: %s, got %s", tt.expectEncoding, contentEncoding)
			}
		})
	}
}
