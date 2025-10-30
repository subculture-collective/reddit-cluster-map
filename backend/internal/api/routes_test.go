package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestSearchEndpointRegistered verifies the search endpoint is registered
func TestSearchEndpointRegistered(t *testing.T) {
	// This test verifies the route is registered
	// Actual functionality is tested in handlers package
	router := NewRouter(nil)

	// Test that search endpoint exists (will panic if route not found)
	req := httptest.NewRequest(http.MethodGet, "/api/search", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	// With nil queries it will error, but the route should exist
	// We're just testing route registration, not functionality
	if rr.Code == http.StatusNotFound {
		t.Error("search endpoint not registered")
	}
}

// TestExportEndpointRegistered verifies the export endpoint is registered
func TestExportEndpointRegistered(t *testing.T) {
	router := NewRouter(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/export", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	// With nil queries it will error, but the route should exist
	if rr.Code == http.StatusNotFound {
		t.Error("export endpoint not registered")
	}
}
