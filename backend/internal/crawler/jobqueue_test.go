package crawler

import (
	"testing"
	"time"
)

func TestCalculateRetryDelay(t *testing.T) {
	tests := []struct {
		name       string
		retryCount int32
		minDelay   time.Duration
		maxDelay   time.Duration
	}{
		{"first retry", 0, 50 * time.Second, 90 * time.Second},  // 1m * 2^0 ± 20%
		{"second retry", 1, 100 * time.Second, 3 * time.Minute}, // 1m * 2^1 ± 20%
		{"third retry", 2, 3 * time.Minute, 5 * time.Minute},    // 1m * 2^2 ± 20%
		{"many retries", 20, 20 * time.Hour, 29 * time.Hour},    // capped at 24h + jitter
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			delay := CalculateRetryDelay(tt.retryCount)
			if delay < tt.minDelay || delay > tt.maxDelay {
				t.Errorf("CalculateRetryDelay(%d) = %v, want between %v and %v",
					tt.retryCount, delay, tt.minDelay, tt.maxDelay)
			}
		})
	}
}

func TestCalculateRetryDelay_Exponential(t *testing.T) {
	// Test that delay increases exponentially
	var prevDelay time.Duration
	for i := int32(0); i < 5; i++ {
		delay := CalculateRetryDelay(i)
		if i > 0 && delay <= prevDelay {
			t.Errorf("Delay should increase exponentially, got %v after %v for retry %d",
				delay, prevDelay, i)
		}
		prevDelay = delay
	}
}

func TestCalculateRetryDelay_Capped(t *testing.T) {
	// Test that very high retry counts are capped
	maxExpected := 29 * time.Hour // 24h + 20% jitter
	for i := int32(15); i < 25; i++ {
		delay := CalculateRetryDelay(i)
		if delay > maxExpected {
			t.Errorf("CalculateRetryDelay(%d) = %v, should be capped below %v",
				i, delay, maxExpected)
		}
	}
}
