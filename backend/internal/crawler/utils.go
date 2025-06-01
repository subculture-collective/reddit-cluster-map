package crawler

import (
	"context"
	"database/sql"
	"log"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

// extractPostID parses a Reddit permalink and extracts the post ID.
func extractPostID(permalink string) string {
	// /r/{sub}/comments/{post_id}/...
	parts := strings.Split(permalink, "/")
	for i := 0; i < len(parts)-1; i++ {
		if parts[i] == "comments" && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
}

// orderedPair returns a consistent tuple of two subreddit names (alphabetical order).
func orderedPair(a, b string) [2]string {
	if a < b {
		return [2]string{a, b}
	}
	return [2]string{b, a}
}

// ToInsertPostParams converts a Post into InsertPostParams.
func ToInsertPostParams(p Post, s string) db.InsertPostParams {
	return db.InsertPostParams{
		ID:        p.ID,
		Author:    p.Author,
		Subreddit: s,
		Title:     sql.NullString{String: p.Title, Valid: p.Title != ""},
		Permalink: sql.NullString{String: p.Permalink, Valid: p.Permalink != ""},
		Score:     sql.NullInt32{Int32: int32(p.Score), Valid: p.Score >= 0},
		Flair:     sql.NullString{String: p.Flair, Valid: p.Flair != ""},
		Url:       sql.NullString{String: p.URL, Valid: p.URL != ""},
		IsSelf:    sql.NullBool{Bool: p.IsSelf, Valid: true},
		CreatedAt: sql.NullTime{Time: p.CreatedAt, Valid: !p.CreatedAt.IsZero()},
	}
}

// ToInsertCommentParams converts a Comment into InsertCommentParams.
func ToInsertCommentParams(c Comment, postID, sub string) db.InsertCommentParams {
	return db.InsertCommentParams{
		ID:        c.ID,
		PostID:    postID,
		Author:    c.Author,
		Subreddit: sub,
		Body:      sql.NullString{String: c.Body, Valid: c.Body != ""},
		CreatedAt: sql.NullTime{Time: c.CreatedAt, Valid: !c.CreatedAt.IsZero()},
		ParentID:  sql.NullString{String: c.ParentID, Valid: c.ParentID != ""},
	}
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

func ToUpsertPostParams(p Post, sub string) db.UpsertPostParams {
	return db.UpsertPostParams{
		ID:        p.ID,
		Author:    p.Author,
		Subreddit: sub,
		Title:     sql.NullString{String: p.Title, Valid: p.Title != ""},
		Permalink: sql.NullString{String: p.Permalink, Valid: p.Permalink != ""},
		Score:     sql.NullInt32{Int32: int32(p.Score), Valid: true},
		Flair:     sql.NullString{String: p.Flair, Valid: p.Flair != ""},
		Url:       sql.NullString{String: p.URL, Valid: p.URL != ""},
		IsSelf:    sql.NullBool{Bool: p.IsSelf, Valid: true},
		CreatedAt: sql.NullTime{Time: p.CreatedAt, Valid: !p.CreatedAt.IsZero()},
	}
}

func PickRandomString(list []string) string {
    if len(list) == 0 {
        return ""
    }
    return list[rand.Intn(len(list))]
}

// ParseBoolEnv parses a boolean environment variable with a default.
func ParseBoolEnv(key string, defaultVal bool) bool {
	val := strings.ToLower(os.Getenv(key))
	switch val {
	case "1", "true", "yes":
		return true
	case "0", "false", "no":
		return false
	default:
		return defaultVal
	}
}

// GetEnvAsInt retrieves an environment variable as an integer with a default fallback.
func GetEnvAsInt(name string, defaultVal int) int {
	if valStr := os.Getenv(name); valStr != "" {
		if val, err := strconv.Atoi(valStr); err == nil {
			return val
		}
	}
	return defaultVal
}

// GetEnvAsSlice retrieves an environment variable as a slice of strings, split by a separator.
func GetEnvAsSlice(name string, defaultVal []string, sep string) []string {
	if valStr := os.Getenv(name); valStr != "" {
		return strings.Split(valStr, sep)
	}
	return defaultVal
}

// FetchUserSubredditsConfig holds configurable options for subreddit discovery.
type FetchUserSubredditsConfig struct {
	Limit      int
	MaxEnqueue int
	Enabled    bool
}

var seenUsers = struct {
	m map[string]bool
	sync.Mutex
}{m: make(map[string]bool)}

// ShouldFetchForUser checks if a user has already been processed.
func ShouldFetchForUser(username string) bool {
	seenUsers.Lock()
	defer seenUsers.Unlock()
	if seenUsers.m[username] {
		return false
	}
	seenUsers.m[username] = true
	return true
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

func FetchAndQueueUserSubreddits(ctx context.Context, q *db.Queries, username string, config FetchUserSubredditsConfig) {
	if !config.Enabled || !ShouldFetchForUser(username) {
		return
	}

	subs, err := FetchRecentUserSubreddits(username, config.Limit)
	if err != nil {
		log.Printf("⚠️ Failed to fetch subs for u/%s: %v", username, err)
		return
	}

	shuffled := ShuffleStrings(subs)
	count := 0

	for _, sub := range shuffled {
		exists, err := q.CrawlJobExists(ctx, sub)
		if err != nil {
			log.Printf("⚠️ Failed to check if job exists for r/%s: %v", sub, err)
			continue
		}
		if exists {
			continue
		}

		if err := q.EnqueueCrawlJob(ctx, sub); err == nil {
			
			count++
			if count >= config.MaxEnqueue {
				break
			}
		}
	}

	log.Printf("📬 Enqueued %d new subs from u/%s", count, username)
}

func LoadUserSubConfig() FetchUserSubredditsConfig {
	return FetchUserSubredditsConfig{
		Enabled:    ParseBoolEnv("FETCH_USER_SUBREDDITS", true),
		Limit:      GetEnvAsInt("USER_SUB_FETCH_LIMIT", 20),
		MaxEnqueue: GetEnvAsInt("USER_SUB_ENQUEUE_MAX", 5),
	}
}

// FetchAndQueueUserSubredditsForAuthors processes a list of authors and queues subs for each.
func FetchAndQueueUserSubredditsForAuthors(ctx context.Context, q *db.Queries, authors []string, config FetchUserSubredditsConfig) {
	for _, author := range authors {
		FetchAndQueueUserSubreddits(ctx, q, author, config)
	}
}