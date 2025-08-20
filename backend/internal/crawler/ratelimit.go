package crawler

import (
	"time"
)

var limiter <-chan time.Time

func init() {
	// Global, coarse-grained pacing for all outbound HTTP requests to Reddit.
	// Reddit’s guidelines discourage aggressive access; we keep at most ~1.66 rps.
	// Every HTTP attempt (including retries and token calls) waits on this tick.
	limiter = time.Tick(601 * time.Millisecond) // 601ms between calls
}

func waitForRateLimit() {
	<-limiter
}
