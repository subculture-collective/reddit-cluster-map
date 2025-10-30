package scheduler

import (
	"testing"
	"time"
)

func TestValidateCronExpression(t *testing.T) {
	tests := []struct {
		name    string
		expr    string
		wantErr bool
	}{
		{"yearly", "@yearly", false},
		{"monthly", "@monthly", false},
		{"weekly", "@weekly", false},
		{"daily", "@daily", false},
		{"hourly", "@hourly", false},
		{"every 1h", "@every 1h", false},
		{"every 30m", "@every 30m", false},
		{"every 7d", "@every 7d", false},
		{"invalid", "@invalid", true},
		{"empty", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateCronExpression(tt.expr)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateCronExpression(%q) error = %v, wantErr %v", tt.expr, err, tt.wantErr)
			}
		})
	}
}

func TestParseCronExpression(t *testing.T) {
	baseTime := time.Date(2024, 1, 15, 10, 30, 0, 0, time.UTC)

	tests := []struct {
		name     string
		expr     string
		wantHour int
		wantDay  int
	}{
		{"hourly", "@hourly", 11, 15},
		{"daily", "@daily", 0, 16},
		{"every 1h", "@every 1h", 11, 15},
		{"every 30m", "@every 30m", 11, 15},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			next, err := ParseCronExpression(tt.expr, baseTime)
			if err != nil {
				t.Fatalf("ParseCronExpression(%q) error = %v", tt.expr, err)
			}
			if next.Hour() != tt.wantHour {
				t.Errorf("Hour = %d, want %d", next.Hour(), tt.wantHour)
			}
			if next.Day() != tt.wantDay {
				t.Errorf("Day = %d, want %d", next.Day(), tt.wantDay)
			}
		})
	}
}

func TestParseEveryDuration(t *testing.T) {
	baseTime := time.Date(2024, 1, 15, 10, 30, 0, 0, time.UTC)

	tests := []struct {
		name     string
		duration string
		want     time.Duration
	}{
		{"1 hour", "1h", 1 * time.Hour},
		{"30 minutes", "30m", 30 * time.Minute},
		{"1 day", "1d", 24 * time.Hour},
		{"7 days", "7d", 7 * 24 * time.Hour},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			next, err := parseEveryDuration(tt.duration, baseTime)
			if err != nil {
				t.Fatalf("parseEveryDuration(%q) error = %v", tt.duration, err)
			}
			got := next.Sub(baseTime)
			if got != tt.want {
				t.Errorf("Duration = %v, want %v", got, tt.want)
			}
		})
	}
}
