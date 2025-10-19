package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORS_AllowedOrigin(t *testing.T) {
	config := &CORSConfig{
		AllowedOrigins: []string{"http://localhost:3000", "https://example.com"},
		AllowedMethods: []string{"GET", "POST"},
		AllowedHeaders: []string{"Content-Type"},
		MaxAge:         300,
	}

	handler := CORS(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if origin := rr.Header().Get("Access-Control-Allow-Origin"); origin != "http://localhost:3000" {
		t.Errorf("Expected Access-Control-Allow-Origin: http://localhost:3000, got %s", origin)
	}
}

func TestCORS_DisallowedOrigin(t *testing.T) {
	config := &CORSConfig{
		AllowedOrigins: []string{"http://localhost:3000"},
	}

	handler := CORS(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "http://evil.com")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if origin := rr.Header().Get("Access-Control-Allow-Origin"); origin != "" {
		t.Errorf("Expected no Access-Control-Allow-Origin header, got %s", origin)
	}
}

func TestCORS_PreflightRequest(t *testing.T) {
	config := &CORSConfig{
		AllowedOrigins: []string{"http://localhost:3000"},
		AllowedMethods: []string{"GET", "POST", "DELETE"},
		AllowedHeaders: []string{"Content-Type", "Authorization"},
		MaxAge:         600,
	}

	handler := CORS(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("OPTIONS", "/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Errorf("Expected status 204 for OPTIONS request, got %d", rr.Code)
	}

	methods := rr.Header().Get("Access-Control-Allow-Methods")
	if methods != "GET, POST, DELETE" {
		t.Errorf("Expected Access-Control-Allow-Methods: GET, POST, DELETE, got %s", methods)
	}

	headers := rr.Header().Get("Access-Control-Allow-Headers")
	if headers != "Content-Type, Authorization" {
		t.Errorf("Expected Access-Control-Allow-Headers: Content-Type, Authorization, got %s", headers)
	}

	maxAge := rr.Header().Get("Access-Control-Max-Age")
	if maxAge != "600" {
		t.Errorf("Expected Access-Control-Max-Age: 600, got %s", maxAge)
	}
}

func TestCORS_WildcardOrigin(t *testing.T) {
	config := &CORSConfig{
		AllowedOrigins: []string{"*"},
	}

	handler := CORS(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "http://any-domain.com")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if origin := rr.Header().Get("Access-Control-Allow-Origin"); origin != "http://any-domain.com" {
		t.Errorf("Expected Access-Control-Allow-Origin to match request origin, got %s", origin)
	}
}

func TestCORS_WildcardSubdomain(t *testing.T) {
	config := &CORSConfig{
		AllowedOrigins: []string{"*.example.com"},
	}

	handler := CORS(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	tests := []struct {
		origin   string
		expected bool
	}{
		{"http://api.example.com", true},
		{"https://app.example.com", true},
		{"http://notexample.com", false},
		{"http://example.com.evil.com", false},
	}

	for _, tt := range tests {
		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Origin", tt.origin)
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)

		origin := rr.Header().Get("Access-Control-Allow-Origin")
		if tt.expected && origin != tt.origin {
			t.Errorf("Expected origin %s to be allowed, but got %s", tt.origin, origin)
		}
		if !tt.expected && origin != "" {
			t.Errorf("Expected origin %s to be denied, but it was allowed", tt.origin)
		}
	}
}

func TestCORS_Credentials(t *testing.T) {
	config := &CORSConfig{
		AllowedOrigins:   []string{"http://localhost:3000"},
		AllowCredentials: true,
	}

	handler := CORS(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if creds := rr.Header().Get("Access-Control-Allow-Credentials"); creds != "true" {
		t.Errorf("Expected Access-Control-Allow-Credentials: true, got %s", creds)
	}
}

func TestCORS_DefaultConfig(t *testing.T) {
	handler := CORS(nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if origin := rr.Header().Get("Access-Control-Allow-Origin"); origin != "http://localhost:5173" {
		t.Errorf("Default config should allow localhost:5173, got %s", origin)
	}
}

func TestCORS_ExposedHeaders(t *testing.T) {
	config := &CORSConfig{
		AllowedOrigins: []string{"http://localhost:3000"},
		ExposedHeaders: []string{"X-Total-Count", "Link"},
	}

	handler := CORS(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	exposed := rr.Header().Get("Access-Control-Expose-Headers")
	if exposed != "X-Total-Count, Link" {
		t.Errorf("Expected Access-Control-Expose-Headers: X-Total-Count, Link, got %s", exposed)
	}
}
