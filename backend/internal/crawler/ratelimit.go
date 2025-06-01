package crawler

import (
	"time"
)

var limiter <-chan time.Time

func init() {
	limiter = time.Tick(1001 * time.Millisecond) // 1.001s between calls
}

func waitForRateLimit() {
	<-limiter
}
