package scheduler

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ParseCronExpression parses a cron expression and returns the next run time from a given base time
func ParseCronExpression(expr string, baseTime time.Time) (time.Time, error) {
	expr = strings.TrimSpace(expr)

	// Handle special expressions
	if strings.HasPrefix(expr, "@") {
		return parseSpecialExpression(expr, baseTime)
	}

	// Handle standard cron format (we'll support simple cases)
	// For now, we implement basic functionality. Full cron would need a proper library
	return time.Time{}, fmt.Errorf("standard cron expressions not yet implemented, use @every or @daily/@hourly/@weekly/@monthly")
}

func parseSpecialExpression(expr string, baseTime time.Time) (time.Time, error) {
	switch {
	case expr == "@yearly" || expr == "@annually":
		return nextYear(baseTime), nil
	case expr == "@monthly":
		return nextMonth(baseTime), nil
	case expr == "@weekly":
		return nextWeek(baseTime), nil
	case expr == "@daily":
		return nextDay(baseTime), nil
	case expr == "@hourly":
		return nextHour(baseTime), nil
	case strings.HasPrefix(expr, "@every "):
		duration := strings.TrimPrefix(expr, "@every ")
		return parseEveryDuration(duration, baseTime)
	default:
		return time.Time{}, fmt.Errorf("unsupported cron expression: %s", expr)
	}
}

func parseEveryDuration(duration string, baseTime time.Time) (time.Time, error) {
	// Parse duration like "1h", "30m", "24h", "7d" etc.
	// Handle days specially since time.ParseDuration doesn't support 'd'
	if strings.HasSuffix(duration, "d") {
		days := strings.TrimSuffix(duration, "d")
		d, err := strconv.Atoi(days)
		if err != nil {
			return time.Time{}, fmt.Errorf("invalid duration: %s", duration)
		}
		return baseTime.Add(time.Duration(d) * 24 * time.Hour), nil
	}

	d, err := time.ParseDuration(duration)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid duration: %s", duration)
	}
	return baseTime.Add(d), nil
}

func nextYear(t time.Time) time.Time {
	return time.Date(t.Year()+1, 1, 1, 0, 0, 0, 0, t.Location())
}

func nextMonth(t time.Time) time.Time {
	year := t.Year()
	month := t.Month() + 1
	if month > 12 {
		month = 1
		year++
	}
	return time.Date(year, month, 1, 0, 0, 0, 0, t.Location())
}

func nextWeek(t time.Time) time.Time {
	// Next Sunday at midnight
	daysUntilSunday := (7 - int(t.Weekday())) % 7
	if daysUntilSunday == 0 {
		daysUntilSunday = 7
	}
	return time.Date(t.Year(), t.Month(), t.Day()+daysUntilSunday, 0, 0, 0, 0, t.Location())
}

func nextDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day()+1, 0, 0, 0, 0, t.Location())
}

func nextHour(t time.Time) time.Time {
	return t.Add(time.Hour).Truncate(time.Hour)
}

// ValidateCronExpression validates a cron expression
func ValidateCronExpression(expr string) error {
	expr = strings.TrimSpace(expr)

	// Special expressions
	if expr == "@yearly" || expr == "@annually" || expr == "@monthly" ||
		expr == "@weekly" || expr == "@daily" || expr == "@hourly" {
		return nil
	}

	// @every duration
	if strings.HasPrefix(expr, "@every ") {
		duration := strings.TrimPrefix(expr, "@every ")
		_, err := parseEveryDuration(duration, time.Now())
		return err
	}

	// Standard cron format validation (basic check)
	cronRegex := regexp.MustCompile(`^(((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*) ?){5,7}$`)
	if cronRegex.MatchString(expr) {
		return fmt.Errorf("standard cron expressions not yet fully supported, use @every or named expressions")
	}

	return fmt.Errorf("invalid cron expression format")
}
