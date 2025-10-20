package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// Crawler metrics
	CrawlerJobsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "crawler_jobs_total",
			Help: "Total number of crawl jobs processed",
		},
		[]string{"status"}, // status: success, failed
	)

	CrawlerJobDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "crawler_job_duration_seconds",
			Help:    "Duration of crawl jobs in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"status"},
	)

	CrawlerHTTPRequests = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "crawler_http_requests_total",
			Help: "Total number of HTTP requests made to Reddit API",
		},
		[]string{"status"}, // status: success, retry, failure
	)

	CrawlerHTTPRetries = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "crawler_http_retries_total",
			Help: "Total number of HTTP request retries",
		},
	)

	CrawlerRateLimitWaits = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "crawler_rate_limit_waits_total",
			Help: "Total number of times crawler waited for rate limit",
		},
	)

	CrawlerRetryAfterWaits = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "crawler_retry_after_wait_seconds",
			Help:    "Duration of Retry-After waits in seconds",
			Buckets: []float64{0.1, 0.5, 1, 2, 5, 10, 30, 60},
		},
	)

	CrawlerPostsProcessed = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "crawler_posts_processed_total",
			Help: "Total number of posts processed",
		},
	)

	CrawlerCommentsProcessed = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "crawler_comments_processed_total",
			Help: "Total number of comments processed",
		},
	)

	// Database operation metrics
	DBOperationDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "db_operation_duration_seconds",
			Help:    "Duration of database operations",
			Buckets: []float64{0.001, 0.01, 0.1, 0.5, 1, 2, 5},
		},
		[]string{"operation"},
	)

	DBOperationErrors = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "db_operation_errors_total",
			Help: "Total number of database operation errors",
		},
		[]string{"operation"},
	)

	// Circuit breaker metrics
	CircuitBreakerState = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "circuit_breaker_state",
			Help: "Circuit breaker state (0=closed, 1=open, 2=half-open)",
		},
		[]string{"component"},
	)

	CircuitBreakerTrips = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "circuit_breaker_trips_total",
			Help: "Total number of circuit breaker trips",
		},
		[]string{"component"},
	)
)
