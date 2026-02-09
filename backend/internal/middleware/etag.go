package middleware

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"net/http"
	"time"
)

const (
	// etagCacheTTL defines how long clients should cache responses with ETags
	etagCacheTTL = 60 * time.Second
	// etagStaleWhileRevalidate defines how long clients can use stale content while revalidating
	etagStaleWhileRevalidate = 300 * time.Second
)

// etagResponseWriter captures response body to generate ETag.
type etagResponseWriter struct {
	http.ResponseWriter
	buf    *bytes.Buffer
	status int
}

func (w *etagResponseWriter) WriteHeader(status int) {
	w.status = status
}

func (w *etagResponseWriter) Write(b []byte) (int, error) {
	return w.buf.Write(b)
}

// ETag returns a middleware that adds ETag support to responses.
// It generates an ETag based on the response body content and
// returns 304 Not Modified if the client's If-None-Match matches.
func ETag(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Create a buffer to capture the response
		buf := &bytes.Buffer{}
		etw := &etagResponseWriter{
			ResponseWriter: w,
			buf:            buf,
			status:         http.StatusOK,
		}

		// Call the next handler
		next.ServeHTTP(etw, r)

		// Generate ETag from response body
		hash := sha256.Sum256(buf.Bytes())
		etag := fmt.Sprintf(`"%x"`, hash[:16]) // Use first 16 bytes for shorter ETag

		// Set ETag and Cache-Control headers for both 200 and 304 responses
		w.Header().Set("ETag", etag)
		w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, stale-while-revalidate=%d",
			int(etagCacheTTL.Seconds()), int(etagStaleWhileRevalidate.Seconds())))

		// Check if client sent If-None-Match
		if match := r.Header.Get("If-None-Match"); match != "" {
			if match == etag {
				// Content hasn't changed, return 304
				w.WriteHeader(http.StatusNotModified)
				return
			}
		}

		// Write response body
		w.WriteHeader(etw.status)
		w.Write(buf.Bytes())
	})
}
