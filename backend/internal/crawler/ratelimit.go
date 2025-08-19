package crawler

import (
	"time"
)

var limiter <-chan time.Time

func init() {
	limiter = time.Tick(651 * time.Millisecond) // 601ms between calls
}

func waitForRateLimit() {
	<-limiter
}
