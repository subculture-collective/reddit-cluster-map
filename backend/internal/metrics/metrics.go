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

	// Crawl job status gauges
	CrawlJobsPending = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "crawl_jobs_pending",
			Help: "Number of pending crawl jobs",
		},
	)

	CrawlJobsProcessing = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "crawl_jobs_processing",
			Help: "Number of crawl jobs currently processing",
		},
	)

	CrawlJobsCompleted = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "crawl_jobs_completed",
			Help: "Number of completed crawl jobs",
		},
	)

	CrawlJobsFailed = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "crawl_jobs_failed",
			Help: "Number of failed crawl jobs",
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

	// API cache metrics
	APICacheHits = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "api_cache_hits_total",
			Help: "Total number of API cache hits",
		},
		[]string{"endpoint"},
	)

	APICacheMisses = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "api_cache_misses_total",
			Help: "Total number of API cache misses",
		},
		[]string{"endpoint"},
	)

	APICacheSize = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "api_cache_size_bytes",
			Help: "Current size of API cache in bytes",
		},
		[]string{"endpoint"},
	)

	APICacheItems = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "api_cache_items",
			Help: "Current number of items in API cache",
		},
		[]string{"endpoint"},
	)

	APICacheEvictions = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "api_cache_evictions_total",
			Help: "Total number of cache evictions",
		},
		[]string{"endpoint"},
	)

	// Graph metrics
	GraphNodesTotal = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "graph_nodes_total",
			Help: "Total number of nodes in the graph by type",
		},
		[]string{"type"}, // type: user, subreddit, post, comment
	)

	GraphLinksTotal = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "graph_links_total",
			Help: "Total number of links in the graph",
		},
	)

	GraphPrecalculationDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "graph_precalculation_duration_seconds",
			Help:    "Duration of graph precalculation in seconds",
			Buckets: []float64{1, 5, 10, 30, 60, 120, 300, 600},
		},
	)

	GraphPrecalculationErrors = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "graph_precalculation_errors_total",
			Help: "Total number of graph precalculation errors",
		},
	)

	// API request metrics
	APIRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "api_request_duration_seconds",
			Help:    "Duration of API requests in seconds",
			Buckets: []float64{0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5},
		},
		[]string{"endpoint", "method", "status"},
	)

	APIRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "api_requests_total",
			Help: "Total number of API requests",
		},
		[]string{"endpoint", "method", "status"},
	)

	// Community metrics
	CommunitiesTotal = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "communities_total",
			Help: "Total number of detected communities",
		},
	)

	CommunityDetectionDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "community_detection_duration_seconds",
			Help:    "Duration of community detection in seconds",
			Buckets: []float64{1, 5, 10, 30, 60, 120, 300},
		},
	)

	// Metrics collection error tracking
	MetricsCollectionErrors = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "metrics_collection_errors_total",
			Help: "Total number of errors during metrics collection",
		},
		[]string{"collector"}, // collector: graph, community, database, crawl_jobs
	)

	// WebSocket metrics
	WebSocketConnections = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "websocket_connections_active",
			Help: "Number of active WebSocket connections",
		},
	)

	WebSocketMessagesSent = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "websocket_messages_sent_total",
			Help: "Total number of WebSocket messages sent to clients",
		},
	)
)
