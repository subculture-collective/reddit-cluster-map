package apierr

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNew(t *testing.T) {
	err := New(ErrGraphTimeout, "timeout occurred", http.StatusRequestTimeout)
	if err.Code != ErrGraphTimeout {
		t.Errorf("expected code %s, got %s", ErrGraphTimeout, err.Code)
	}
	if err.Message != "timeout occurred" {
		t.Errorf("expected message 'timeout occurred', got '%s'", err.Message)
	}
	if err.Status() != http.StatusRequestTimeout {
		t.Errorf("expected status %d, got %d", http.StatusRequestTimeout, err.Status())
	}
}

func TestWithDetails(t *testing.T) {
	err := New(ErrValidationInvalidValue, "invalid field", http.StatusBadRequest).
		WithDetails(map[string]interface{}{"field": "username"})
	
	if err.Details == nil {
		t.Fatal("expected details to be set")
	}
	if field, ok := err.Details["field"]; !ok || field != "username" {
		t.Errorf("expected field 'username', got %v", field)
	}
}

func TestWithRequestID(t *testing.T) {
	requestID := "test-request-123"
	err := New(ErrSystemInternal, "internal error", http.StatusInternalServerError).
		WithRequestID(requestID)
	
	if err.RequestID != requestID {
		t.Errorf("expected request ID %s, got %s", requestID, err.RequestID)
	}
}

func TestErrorInterface(t *testing.T) {
	err := New(ErrAuthInvalid, "invalid token", http.StatusUnauthorized)
	expected := "AUTH_INVALID: invalid token"
	if err.Error() != expected {
		t.Errorf("expected error string %s, got %s", expected, err.Error())
	}
}

func TestWriteError(t *testing.T) {
	w := httptest.NewRecorder()
	err := New(ErrGraphTimeout, "timeout", http.StatusRequestTimeout).
		WithRequestID("req-123")
	
	WriteError(w, err)
	
	if w.Code != http.StatusRequestTimeout {
		t.Errorf("expected status %d, got %d", http.StatusRequestTimeout, w.Code)
	}
	
	contentType := w.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", contentType)
	}
	
	var resp ErrorResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	
	if resp.Error == nil {
		t.Fatal("expected error in response")
	}
	if resp.Error.Code != ErrGraphTimeout {
		t.Errorf("expected code %s, got %s", ErrGraphTimeout, resp.Error.Code)
	}
	if resp.Error.Message != "timeout" {
		t.Errorf("expected message 'timeout', got '%s'", resp.Error.Message)
	}
	if resp.Error.RequestID != "req-123" {
		t.Errorf("expected request ID 'req-123', got '%s'", resp.Error.RequestID)
	}
}

func TestHelperFunctions(t *testing.T) {
	tests := []struct {
		name       string
		createErr  func() *Error
		wantCode   ErrorCode
		wantStatus int
	}{
		{"AuthMissing", func() *Error { return AuthMissing("") }, ErrAuthMissing, http.StatusUnauthorized},
		{"AuthInvalid", func() *Error { return AuthInvalid("") }, ErrAuthInvalid, http.StatusUnauthorized},
		{"AuthForbidden", func() *Error { return AuthForbidden("") }, ErrAuthForbidden, http.StatusForbidden},
		{"AuthOAuthNotConfigured", func() *Error { return AuthOAuthNotConfigured() }, ErrAuthOAuthNotConfig, http.StatusServiceUnavailable},
		{"AuthOAuthFailed", func() *Error { return AuthOAuthFailed("") }, ErrAuthOAuthFailed, http.StatusBadGateway},
		{"GraphTimeout", func() *Error { return GraphTimeout("") }, ErrGraphTimeout, http.StatusRequestTimeout},
		{"GraphQueryFailed", func() *Error { return GraphQueryFailed("") }, ErrGraphQuery, http.StatusInternalServerError},
		{"GraphNoData", func() *Error { return GraphNoData() }, ErrGraphNoData, http.StatusNotFound},
		{"GraphInvalidParams", func() *Error { return GraphInvalidParams("") }, ErrGraphInvalidParams, http.StatusBadRequest},
		{"CrawlInvalidSubreddit", func() *Error { return CrawlInvalidSubreddit("") }, ErrCrawlInvalidSubreddit, http.StatusBadRequest},
		{"CrawlQueueFailed", func() *Error { return CrawlQueueFailed("") }, ErrCrawlQueueFailed, http.StatusInternalServerError},
		{"CrawlRateLimited", func() *Error { return CrawlRateLimited("") }, ErrCrawlRateLimited, http.StatusTooManyRequests},
		{"CrawlNotFound", func() *Error { return CrawlNotFound("") }, ErrCrawlNotFound, http.StatusNotFound},
		{"SearchInvalidQuery", func() *Error { return SearchInvalidQuery("") }, ErrSearchInvalidQuery, http.StatusBadRequest},
		{"SearchTimeout", func() *Error { return SearchTimeout() }, ErrSearchTimeout, http.StatusRequestTimeout},
		{"SearchFailed", func() *Error { return SearchFailed("") }, ErrSearchFailed, http.StatusInternalServerError},
		{"SystemInternal", func() *Error { return SystemInternal("") }, ErrSystemInternal, http.StatusInternalServerError},
		{"SystemDatabase", func() *Error { return SystemDatabase("") }, ErrSystemDatabase, http.StatusInternalServerError},
		{"SystemUnavailable", func() *Error { return SystemUnavailable("") }, ErrSystemUnavailable, http.StatusServiceUnavailable},
		{"SystemTimeout", func() *Error { return SystemTimeout("") }, ErrSystemTimeout, http.StatusRequestTimeout},
		{"ValidationInvalidJSON", func() *Error { return ValidationInvalidJSON() }, ErrValidationInvalidJSON, http.StatusBadRequest},
		{"ValidationInvalidFormat", func() *Error { return ValidationInvalidFormat("") }, ErrValidationInvalidFormat, http.StatusBadRequest},
		{"ValidationMissingField", func() *Error { return ValidationMissingField("username") }, ErrValidationMissingField, http.StatusBadRequest},
		{"ValidationInvalidValue", func() *Error { return ValidationInvalidValue("age", "") }, ErrValidationInvalidValue, http.StatusBadRequest},
		{"ResourceNotFound", func() *Error { return ResourceNotFound("user") }, ErrResourceNotFound, http.StatusNotFound},
		{"ResourceConflict", func() *Error { return ResourceConflict("") }, ErrResourceConflict, http.StatusConflict},
		{"RateLimitGlobal", func() *Error { return RateLimitGlobal() }, ErrRateLimitGlobal, http.StatusTooManyRequests},
		{"RateLimitIP", func() *Error { return RateLimitIP() }, ErrRateLimitIP, http.StatusTooManyRequests},
	}
	
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.createErr()
			if err.Code != tt.wantCode {
				t.Errorf("expected code %s, got %s", tt.wantCode, err.Code)
			}
			if err.Status() != tt.wantStatus {
				t.Errorf("expected status %d, got %d", tt.wantStatus, err.Status())
			}
			if err.Message == "" {
				t.Error("expected non-empty message")
			}
		})
	}
}

func TestValidationMissingFieldDetails(t *testing.T) {
	err := ValidationMissingField("username")
	if err.Details == nil {
		t.Fatal("expected details to be set")
	}
	if field, ok := err.Details["field"]; !ok || field != "username" {
		t.Errorf("expected field 'username', got %v", field)
	}
}

func TestResourceNotFoundDetails(t *testing.T) {
	err := ResourceNotFound("community")
	if err.Details == nil {
		t.Fatal("expected details to be set")
	}
	if rt, ok := err.Details["resource_type"]; !ok || rt != "community" {
		t.Errorf("expected resource_type 'community', got %v", rt)
	}
}
