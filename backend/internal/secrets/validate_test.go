package secrets

import (
	"strings"
	"testing"
)

func TestValidateRequired(t *testing.T) {
	tests := []struct {
		name        string
		secrets     map[string]string
		expectError bool
		errorMsg    string
	}{
		{
			name: "all secrets present",
			secrets: map[string]string{
				"CLIENT_ID":     "abc123",
				"CLIENT_SECRET": "secret123",
			},
			expectError: false,
		},
		{
			name: "empty secret value",
			secrets: map[string]string{
				"CLIENT_ID":     "abc123",
				"CLIENT_SECRET": "",
			},
			expectError: true,
			errorMsg:    "CLIENT_SECRET",
		},
		{
			name: "multiple empty values",
			secrets: map[string]string{
				"CLIENT_ID":     "",
				"CLIENT_SECRET": "",
			},
			expectError: true,
			errorMsg:    "CLIENT_ID",
		},
		{
			name:        "empty map",
			secrets:     map[string]string{},
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateRequired(tt.secrets)

			if tt.expectError {
				if err == nil {
					t.Errorf("expected error but got nil")
					return
				}
				if !strings.Contains(err.Error(), tt.errorMsg) {
					t.Errorf("expected error message to contain %q, got %q", tt.errorMsg, err.Error())
				}

				// Check that it's a ValidationError
				if _, ok := err.(*ValidationError); !ok {
					t.Errorf("expected ValidationError, got %T", err)
				}
			} else {
				if err != nil {
					t.Errorf("expected no error but got: %v", err)
				}
			}
		})
	}
}

func TestValidationError_Error(t *testing.T) {
	tests := []struct {
		name     string
		err      *ValidationError
		contains []string
	}{
		{
			name: "only empty values",
			err: &ValidationError{
				Empty: []string{"KEY1", "KEY2"},
			},
			contains: []string{"empty values", "KEY1", "KEY2"},
		},
		{
			name: "only missing keys",
			err: &ValidationError{
				Missing: []string{"KEY3"},
			},
			contains: []string{"missing", "KEY3"},
		},
		{
			name: "both missing and empty",
			err: &ValidationError{
				Missing: []string{"KEY1"},
				Empty:   []string{"KEY2"},
			},
			contains: []string{"missing", "KEY1", "empty", "KEY2"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errMsg := tt.err.Error()
			for _, expected := range tt.contains {
				if !strings.Contains(errMsg, expected) {
					t.Errorf("error message %q should contain %q", errMsg, expected)
				}
			}
		})
	}
}
