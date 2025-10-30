package graph

import (
	"testing"
)

func TestTruncateUTF8(t *testing.T) {
	tests := []struct {
		name  string
		input string
		max   int
		want  string
	}{
		{
			name:  "empty string",
			input: "",
			max:   10,
			want:  "",
		},
		{
			name:  "zero max",
			input: "hello",
			max:   0,
			want:  "",
		},
		{
			name:  "negative max",
			input: "hello",
			max:   -1,
			want:  "",
		},
		{
			name:  "shorter than max",
			input: "hello",
			max:   10,
			want:  "hello",
		},
		{
			name:  "exact max",
			input: "hello",
			max:   5,
			want:  "hello",
		},
		{
			name:  "longer than max",
			input: "hello world",
			max:   5,
			want:  "hello",
		},
		{
			name:  "unicode characters",
			input: "こんにちは世界",
			max:   3,
			want:  "こんに",
		},
		{
			name:  "mixed ascii and unicode",
			input: "Hello 世界",
			max:   7,
			want:  "Hello 世",
		},
		{
			name:  "emoji",
			input: "😀😁😂",
			max:   2,
			want:  "😀😁",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := truncateUTF8(tt.input, tt.max)
			if got != tt.want {
				t.Errorf("truncateUTF8(%q, %d) = %q, want %q", tt.input, tt.max, got, tt.want)
			}
		})
	}
}

func TestProgressLogger(t *testing.T) {
	// Test basic creation
	pl := newProgressLogger("test", 100)
	if pl.name != "test" {
		t.Errorf("expected name 'test', got %q", pl.name)
	}
	if pl.interval != 100 {
		t.Errorf("expected interval 100, got %d", pl.interval)
	}

	// Test default interval
	pl2 := newProgressLogger("test2", 0)
	if pl2.interval != 10000 {
		t.Errorf("expected default interval 10000, got %d", pl2.interval)
	}

	// Test increment
	pl.Inc(1)
	if pl.count != 1 {
		t.Errorf("expected count 1, got %d", pl.count)
	}

	pl.Inc(5)
	if pl.count != 6 {
		t.Errorf("expected count 6, got %d", pl.count)
	}

	// Test Done (just ensure it doesn't panic)
	pl.Done("6")
	pl2.Done("")
}

func TestNewService(t *testing.T) {
	fs := newFakeStore()
	svc := NewService(fs)
	if svc == nil {
		t.Fatal("expected non-nil service")
	}
	if svc.store != fs {
		t.Error("service store not set correctly")
	}
}
