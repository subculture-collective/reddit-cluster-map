package utils

import (
	"math/rand"
	"strings"
	"time"
)

func init() {
	// Seed the global random number generator to ensure non-deterministic behavior
	rand.Seed(time.Now().UnixNano())
}

func ContainsString(slice []string, val string) bool {
	for _, s := range slice {
		if s == val {
			return true
		}
	}
	return false
}

func UniqueStrings(input []string) []string {
	seen := make(map[string]bool)
	var result []string
	for _, val := range input {
		if !seen[val] {
			result = append(result, val)
			seen[val] = true
		}
	}
	return result
}

func Retry(attempts int, delay time.Duration, fn func() error) error {
	var err error
	for i := 0; i < attempts; i++ {
		err = fn()
		if err == nil {
			return nil
		}
		time.Sleep(delay)
	}
	return err
}

func SanitizeUsername(name string) string {
	return strings.TrimPrefix(strings.TrimSpace(name), "u/")
}

// ShuffleStrings returns a shuffled copy of a string slice.
func ShuffleStrings(input []string) []string {
	rnd := rand.New(rand.NewSource(time.Now().UnixNano()))
	shuffled := make([]string, len(input))
	copy(shuffled, input)
	rnd.Shuffle(len(shuffled), func(i, j int) {
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	})
	return shuffled
}

func PickRandomString(list []string) string {
	if len(list) == 0 {
		return ""
	}
	return list[rand.Intn(len(list))]
}

// OrderedPair returns a consistent tuple of two subreddit names (alphabetical order).
func OrderedPair(a, b string) [2]string {
	if a < b {
		return [2]string{a, b}
	}
	return [2]string{b, a}
}

// ExtractPostID parses a Reddit permalink and extracts the post ID.
func ExtractPostID(permalink string) string {
	// /r/{sub}/comments/{post_id}/...
	parts := strings.Split(permalink, "/")
	for i := 0; i < len(parts)-1; i++ {
		if parts[i] == "comments" && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
}

func IsValidAuthor(author string) bool {
	return author != "" && author != "[deleted]"
}

// StripPrefix removes Reddit's "t1_" or "t3_" prefixes from comment and post IDs.
func StripPrefix(id string) string {
	if strings.HasPrefix(id, "t1_") || strings.HasPrefix(id, "t3_") {
		return id[3:]
	}
	return id
}
