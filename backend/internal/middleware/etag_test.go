package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestETag(t *testing.T) {
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"message":"test response"}`))
	})

	tests := []struct {
		name         string
		ifNoneMatch  string
		expectStatus int
		expectETag   bool
		expectBody   bool
	}{
		{
			name:         "first request without If-None-Match",
			ifNoneMatch:  "",
			expectStatus: http.StatusOK,
			expectETag:   true,
			expectBody:   true,
		},
		{
			name:         "request with non-matching If-None-Match",
			ifNoneMatch:  `"different-etag"`,
			expectStatus: http.StatusOK,
			expectETag:   true,
			expectBody:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := ETag(testHandler)
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			if tt.ifNoneMatch != "" {
				req.Header.Set("If-None-Match", tt.ifNoneMatch)
			}
			rr := httptest.NewRecorder()

			handler.ServeHTTP(rr, req)

			if rr.Code != tt.expectStatus {
				t.Errorf("expected status %d, got %d", tt.expectStatus, rr.Code)
			}

			etag := rr.Header().Get("ETag")
			if tt.expectETag && etag == "" {
				t.Error("expected ETag header to be set")
			}

			if tt.expectBody {
				if rr.Body.Len() == 0 {
					t.Error("expected response body, got empty")
				}
			}

			cacheControl := rr.Header().Get("Cache-Control")
			if tt.expectStatus == http.StatusOK && cacheControl == "" {
				t.Error("expected Cache-Control header to be set")
			}
			// Verify stale-while-revalidate is present
			if tt.expectStatus == http.StatusOK {
				expected := "public, max-age=60, stale-while-revalidate=300"
				if cacheControl != expected {
					t.Errorf("expected Cache-Control %q, got %q", expected, cacheControl)
				}
			}
		})
	}

	// Test 304 Not Modified with matching ETag
	t.Run("matching ETag returns 304", func(t *testing.T) {
		handler := ETag(testHandler)

		// First request to get the ETag
		req1 := httptest.NewRequest(http.MethodGet, "/test", nil)
		rr1 := httptest.NewRecorder()
		handler.ServeHTTP(rr1, req1)

		if rr1.Code != http.StatusOK {
			t.Fatalf("first request failed with status %d", rr1.Code)
		}

		etag := rr1.Header().Get("ETag")
		if etag == "" {
			t.Fatal("first request did not return ETag")
		}

		// Second request with matching ETag
		req2 := httptest.NewRequest(http.MethodGet, "/test", nil)
		req2.Header.Set("If-None-Match", etag)
		rr2 := httptest.NewRecorder()
		handler.ServeHTTP(rr2, req2)

		if rr2.Code != http.StatusNotModified {
			t.Errorf("expected status 304, got %d", rr2.Code)
		}

		if rr2.Body.Len() > 0 {
			t.Error("expected empty body for 304 response")
		}
	})
}
