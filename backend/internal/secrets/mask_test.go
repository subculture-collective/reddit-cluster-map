package secrets

import "testing"

func TestMask(t *testing.T) {
	tests := []struct {
		name     string
		secret   string
		expected string
	}{
		{
			name:     "empty string",
			secret:   "",
			expected: "",
		},
		{
			name:     "short secret",
			secret:   "abc",
			expected: "***",
		},
		{
			name:     "exact 8 chars",
			secret:   "12345678",
			expected: "***",
		},
		{
			name:     "long secret",
			secret:   "verylongsecretkey123",
			expected: "very...",
		},
		{
			name:     "typical client id",
			secret:   "abcdefghijklmnop",
			expected: "abcd...",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Mask(tt.secret)
			if result != tt.expected {
				t.Errorf("Mask(%q) = %q, want %q", tt.secret, result, tt.expected)
			}
		})
	}
}

func TestMaskURL(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		expected string
	}{
		{
			name:     "empty string",
			url:      "",
			expected: "",
		},
		{
			name:     "url without credentials",
			url:      "postgres://localhost:5432/mydb",
			expected: "postgres://localhost:5432/mydb",
		},
		{
			name:     "url with user only",
			url:      "postgres://user@localhost:5432/mydb",
			expected: "postgres://user@localhost:5432/mydb",
		},
		{
			name:     "url with user and password",
			url:      "postgres://user:secretpass@localhost:5432/mydb",
			expected: "postgres://user:***@localhost:5432/mydb",
		},
		{
			name:     "url with complex password",
			url:      "postgres://admin:p@ssw0rd!@db.example.com:5432/production",
			expected: "postgres://admin:***@db.example.com:5432/production",
		},
		{
			name:     "http url with credentials",
			url:      "https://user:token123@api.example.com/path",
			expected: "https://user:***@api.example.com/path",
		},
		{
			name:     "malformed url",
			url:      "not-a-valid-url",
			expected: "not-a-valid-url",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MaskURL(tt.url)
			if result != tt.expected {
				t.Errorf("MaskURL(%q) = %q, want %q", tt.url, result, tt.expected)
			}
		})
	}
}
