package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/andybalholm/brotli"
)

// compressionResponseWriter wraps http.ResponseWriter to support compression.
type compressionResponseWriter struct {
	io.Writer
	http.ResponseWriter
	wroteHeader bool
}

func (w *compressionResponseWriter) WriteHeader(status int) {
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *compressionResponseWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.Writer.Write(b)
}

// Gzip returns a middleware that compresses HTTP responses with brotli or gzip
// based on client's Accept-Encoding header. Prefers brotli over gzip.
func Gzip(next http.Handler) http.Handler {
	// Pool gzip writers to reduce allocations
	gzPool := sync.Pool{
		New: func() interface{} {
			return gzip.NewWriter(io.Discard)
		},
	}

	// Pool brotli writers to reduce allocations
	brPool := sync.Pool{
		New: func() interface{} {
			return brotli.NewWriter(io.Discard)
		},
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		acceptEncoding := r.Header.Get("Accept-Encoding")

		// Prefer brotli if supported
		if strings.Contains(acceptEncoding, "br") {
			// Get brotli writer from pool
			br := brPool.Get().(*brotli.Writer)
			defer brPool.Put(br)
			br.Reset(w)
			defer br.Close()

			// Set response headers
			w.Header().Set("Content-Encoding", "br")
			w.Header().Del("Content-Length") // Length will change after compression

			// Wrap response writer
			brw := &compressionResponseWriter{Writer: br, ResponseWriter: w}
			next.ServeHTTP(brw, r)
			return
		}

		// Fall back to gzip if supported
		if strings.Contains(acceptEncoding, "gzip") {
			// Get gzip writer from pool
			gz := gzPool.Get().(*gzip.Writer)
			defer gzPool.Put(gz)
			gz.Reset(w)
			defer gz.Close()

			// Set response headers
			w.Header().Set("Content-Encoding", "gzip")
			w.Header().Del("Content-Length") // Length will change after compression

			// Wrap response writer
			gzw := &compressionResponseWriter{Writer: gz, ResponseWriter: w}
			next.ServeHTTP(gzw, r)
			return
		}

		// No compression support
		next.ServeHTTP(w, r)
	})
}
