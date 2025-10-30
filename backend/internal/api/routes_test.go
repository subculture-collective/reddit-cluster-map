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
