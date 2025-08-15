package crawler

import (
	"context"
	"database/sql"
	"log"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

var seenUsers = struct {
	m map[string]bool
}{m: make(map[string]bool)}

// ShouldFetchForUser checks if a user has already been processed.
func ShouldFetchForUser(username string) bool {
	if seenUsers.m[username] {
		return false
	}
	seenUsers.m[username] = true
	return true
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

	shuffled := subs // already sufficiently random for now; utils.ShuffleStrings could be used
	count := 0
	total := len(shuffled)

	for _, sub := range shuffled {
		// Get or create subreddit
		subredditID, err := q.UpsertSubreddit(ctx, db.UpsertSubredditParams{
			Name:        sub,
			Title:       sql.NullString{String: sub, Valid: true},
			Description: sql.NullString{String: "", Valid: true},
			Subscribers: sql.NullInt32{Int32: 0, Valid: true},
		})
		if err != nil {
			log.Printf("⚠️ Failed to upsert subreddit r/%s: %v", sub, err)
			continue
		}

		exists, err := q.CrawlJobExists(ctx, subredditID)
		if err != nil {
			log.Printf("⚠️ Failed to check if job exists for r/%s: %v", sub, err)
			continue
		}
		if exists {
			continue
		}

		if err := q.EnqueueCrawlJob(ctx, db.EnqueueCrawlJobParams{
			SubredditID: subredditID,
			EnqueuedBy:  sql.NullString{String: "system", Valid: true},
		}); err == nil {
			count++
			if count >= config.MaxEnqueue {
				break
			}
		}
	}

	log.Printf("📬 Enqueued %d/%d new subs from u/%s", count, total, username)
}

// FetchAndQueueUserSubredditsForAuthors processes a list of authors and queues subs for each.
func FetchAndQueueUserSubredditsForAuthors(ctx context.Context, q *db.Queries, authors []string, config FetchUserSubredditsConfig) {
	total := len(authors)
	processed := 0

	for _, author := range authors {
		FetchAndQueueUserSubreddits(ctx, q, author, config)
		processed++
		log.Printf("👥 Processed %d/%d users", processed, total)
	}
}
