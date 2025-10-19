package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiter_GlobalLimit(t *testing.T) {
	rl := NewRateLimiter(1.0, 2, 10.0, 10)
	defer rl.Stop()

	handler := rl.Limit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// First request should succeed
	req1 := httptest.NewRequest("GET", "/test", nil)
	req1.RemoteAddr = "192.168.1.1:1234"
	rr1 := httptest.NewRecorder()
	handler.ServeHTTP(rr1, req1)
	if rr1.Code != http.StatusOK {
		t.Errorf("First request failed: got %d, want %d", rr1.Code, http.StatusOK)
	}

	// Second immediate request should succeed (burst)
	req2 := httptest.NewRequest("GET", "/test", nil)
	req2.RemoteAddr = "192.168.1.1:1234"
	rr2 := httptest.NewRecorder()
	handler.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Errorf("Second request failed: got %d, want %d", rr2.Code, http.StatusOK)
	}

	// Third immediate request should fail (exceeds burst)
	req3 := httptest.NewRequest("GET", "/test", nil)
	req3.RemoteAddr = "192.168.1.2:1234"
	rr3 := httptest.NewRecorder()
	handler.ServeHTTP(rr3, req3)
	if rr3.Code != http.StatusTooManyRequests {
		t.Errorf("Third request should be rate limited: got %d, want %d", rr3.Code, http.StatusTooManyRequests)
	}
}

func TestRateLimiter_PerIPLimit(t *testing.T) {
	rl := NewRateLimiter(100.0, 100, 1.0, 2)
	defer rl.Stop()

	handler := rl.Limit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// First request from IP1 should succeed
	req1 := httptest.NewRequest("GET", "/test", nil)
	req1.RemoteAddr = "192.168.1.1:1234"
	rr1 := httptest.NewRecorder()
	handler.ServeHTTP(rr1, req1)
	if rr1.Code != http.StatusOK {
		t.Errorf("First request from IP1 failed: got %d, want %d", rr1.Code, http.StatusOK)
	}

	// Second immediate request from same IP should succeed (burst)
	req2 := httptest.NewRequest("GET", "/test", nil)
	req2.RemoteAddr = "192.168.1.1:5678"
	rr2 := httptest.NewRecorder()
	handler.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Errorf("Second request from IP1 failed: got %d, want %d", rr2.Code, http.StatusOK)
	}

	// Third immediate request from same IP should fail
	req3 := httptest.NewRequest("GET", "/test", nil)
	req3.RemoteAddr = "192.168.1.1:9999"
	rr3 := httptest.NewRecorder()
	handler.ServeHTTP(rr3, req3)
	if rr3.Code != http.StatusTooManyRequests {
		t.Errorf("Third request from IP1 should be rate limited: got %d, want %d", rr3.Code, http.StatusTooManyRequests)
	}

	// Request from different IP should succeed
	req4 := httptest.NewRequest("GET", "/test", nil)
	req4.RemoteAddr = "192.168.1.2:1234"
	rr4 := httptest.NewRecorder()
	handler.ServeHTTP(rr4, req4)
	if rr4.Code != http.StatusOK {
		t.Errorf("Request from IP2 failed: got %d, want %d", rr4.Code, http.StatusOK)
	}
}

func TestGetClientIP_XForwardedFor(t *testing.T) {
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.1, 198.51.100.1")
	req.RemoteAddr = "192.168.1.1:1234"

	ip := getClientIP(req)
	if ip != "203.0.113.1" {
		t.Errorf("Expected IP from X-Forwarded-For: got %s, want 203.0.113.1", ip)
	}
}

func TestGetClientIP_XRealIP(t *testing.T) {
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Real-IP", "203.0.113.1")
	req.RemoteAddr = "192.168.1.1:1234"

	ip := getClientIP(req)
	if ip != "203.0.113.1" {
		t.Errorf("Expected IP from X-Real-IP: got %s, want 203.0.113.1", ip)
	}
}

func TestGetClientIP_RemoteAddr(t *testing.T) {
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:1234"

	ip := getClientIP(req)
	if ip != "192.168.1.1" {
		t.Errorf("Expected IP from RemoteAddr: got %s, want 192.168.1.1", ip)
	}
}

func TestRateLimiter_Cleanup(t *testing.T) {
	rl := NewRateLimiter(10.0, 10, 10.0, 10)
	
	// Create some IP limiters
	rl.getLimiter("192.168.1.1")
	rl.getLimiter("192.168.1.2")
	
	// Check they exist
	rl.mu.RLock()
	count := len(rl.perIP)
	rl.mu.RUnlock()
	if count != 2 {
		t.Errorf("Expected 2 IP limiters, got %d", count)
	}
	
	// Stop the rate limiter (which stops cleanup)
	rl.Stop()
}

func TestRateLimiter_ConcurrentAccess(t *testing.T) {
	rl := NewRateLimiter(100.0, 100, 10.0, 10)
	defer rl.Stop()

	handler := rl.Limit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Simulate concurrent requests from multiple IPs
	done := make(chan bool)
	for i := 0; i < 10; i++ {
		go func(n int) {
			for j := 0; j < 5; j++ {
				req := httptest.NewRequest("GET", "/test", nil)
				req.RemoteAddr = "192.168.1." + string(rune('1'+n)) + ":1234"
				rr := httptest.NewRecorder()
				handler.ServeHTTP(rr, req)
			}
			done <- true
		}(i)
	}

	// Wait for all goroutines to finish
	for i := 0; i < 10; i++ {
		<-done
	}
}

func TestRateLimiter_AfterWait(t *testing.T) {
	rl := NewRateLimiter(10.0, 1, 10.0, 1)
	defer rl.Stop()

	handler := rl.Limit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Make burst requests
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.1:1234"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
	}

	// This should be rate limited
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:1234"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("Request should be rate limited: got %d, want %d", rr.Code, http.StatusTooManyRequests)
	}

	// Wait for rate limit to reset
	time.Sleep(150 * time.Millisecond)

	// This should succeed
	req2 := httptest.NewRequest("GET", "/test", nil)
	req2.RemoteAddr = "192.168.1.1:1234"
	rr2 := httptest.NewRecorder()
	handler.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Errorf("Request after wait should succeed: got %d, want %d", rr2.Code, http.StatusOK)
	}
}
