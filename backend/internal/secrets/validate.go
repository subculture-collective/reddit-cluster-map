package secrets

import (
	"fmt"
	"strings"
)

// ValidationError represents a validation failure for required secrets.
type ValidationError struct {
	Missing []string
	Empty   []string
}

func (e *ValidationError) Error() string {
	var parts []string
	if len(e.Missing) > 0 {
		parts = append(parts, fmt.Sprintf("missing required environment variables: %s", strings.Join(e.Missing, ", ")))
	}
	if len(e.Empty) > 0 {
		parts = append(parts, fmt.Sprintf("empty values for required environment variables: %s", strings.Join(e.Empty, ", ")))
	}
	return strings.Join(parts, "; ")
}

// ValidateRequired checks that all required secrets are present and non-empty.
// Returns a ValidationError if any required secret is missing or empty, nil otherwise.
func ValidateRequired(secrets map[string]string) error {
	var missing []string
	var empty []string

	for key, value := range secrets {
		if value == "" {
			empty = append(empty, key)
		}
	}

	if len(missing) > 0 || len(empty) > 0 {
		return &ValidationError{
			Missing: missing,
			Empty:   empty,
		}
	}

	return nil
}
