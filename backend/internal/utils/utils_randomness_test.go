package utils

import (
"testing"
)

// TestPickRandomString_NonDeterministic verifies that PickRandomString produces varied results.
// This test demonstrates that the random number generator is properly seeded.
func TestPickRandomString_NonDeterministic(t *testing.T) {
options := []string{"a", "b", "c", "d", "e"}

// Collect results from multiple calls
results := make(map[string]int)
iterations := 100

for i := 0; i < iterations; i++ {
choice := PickRandomString(options)
results[choice]++
}

// With proper seeding, we should see multiple different values chosen
// (though theoretically we could get the same value every time, it's extremely unlikely)
if len(results) < 2 {
t.Errorf("Expected at least 2 different values from %d iterations, got %d", iterations, len(results))
}

// Log distribution for debugging
t.Logf("Distribution of %d random picks:", iterations)
for k, v := range results {
t.Logf("  %s: %d times (%.1f%%)", k, v, float64(v)/float64(iterations)*100)
}
}

// TestShuffleStrings_NonDeterministic verifies that ShuffleStrings produces varied results.
func TestShuffleStrings_NonDeterministic(t *testing.T) {
input := []string{"a", "b", "c", "d", "e"}

// Shuffle multiple times and check if we get different results
firstShuffle := ShuffleStrings(input)
differentFound := false

for i := 0; i < 10; i++ {
shuffle := ShuffleStrings(input)
// Check if any position differs
for j := range shuffle {
if shuffle[j] != firstShuffle[j] {
differentFound = true
break
}
}
if differentFound {
break
}
}

if !differentFound {
t.Error("Expected shuffles to produce different results, but all were identical")
}
}
