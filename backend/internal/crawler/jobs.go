package crawler

import (
	"context"
	"database/sql"
	"log"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
	"github.com/onnwee/reddit-cluster-map/backend/internal/utils"
)

var (
	MaxPostsPerSubreddit = utils.GetEnvAsInt("MAX_POSTS_PER_SUB", 50)
	MaxCommentsPerPost   = utils.GetEnvAsInt("MAX_COMMENTS_PER_POST", 100)
	MaxCommentDepth      = utils.GetEnvAsInt("MAX_COMMENT_DEPTH", 3)
	DefaultSubs          = utils.GetEnvAsSlice("DEFAULT_SUBREDDITS", []string{"AskReddit", "worldnews", "technology", "funny", "gaming"}, ",")
)

func handleJob(ctx context.Context, q *db.Queries, job db.CrawlJob) error {
	info, posts, err := CrawlSubreddit(job.Subreddit)
	if err != nil {
		return err
	}

	log.Printf("✅ r/%s: %d posts, %d subs", job.Subreddit, len(posts), info.Subscribers)

	_ = q.UpsertSubreddit(ctx, db.UpsertSubredditParams{
		Name:        job.Subreddit,
		Title:       sql.NullString{String: info.Title, Valid: info.Title != ""},
		Description: sql.NullString{String: info.Description, Valid: info.Description != ""},
		Subscribers: sql.NullInt32{Int32: int32(info.Subscribers), Valid: info.Subscribers >= 0},
	})

	if len(posts) > MaxPostsPerSubreddit {
		posts = posts[:MaxPostsPerSubreddit]
	}

	if err := crawlAndStorePosts(ctx, q, job.Subreddit, posts); err != nil {
		log.Printf("⚠️ failed to crawl posts: %v", err)
	}
	if err := crawlAndStoreComments(ctx, q, job.Subreddit, posts, utils.GetEnvAsInt("MAX_COMMENT_DEPTH", 5)); err != nil {
		log.Printf("⚠️ failed to crawl comments: %v", err)
	}

	enqueueLinkedSubreddits(ctx, q, posts)
	return nil
}

func crawlAndStorePosts(ctx context.Context, q *db.Queries, sub string, posts []Post) error {
	for _, post := range posts {
		if post.Author == "" || post.Author == "[deleted]" {
			continue
		}

		if err := q.UpsertUser(ctx, post.Author); err != nil {
			log.Printf("⚠️ failed to upsert user %s: %v", post.Author, err)
			continue
		}

		params := ToUpsertPostParams(post, sub)
		if err := q.UpsertPost(ctx, params); err != nil {
			log.Printf("⚠️ failed to upsert post (ID=%s, Author=%s): %v", post.ID, post.Author, err)
		}
	}
	return nil
}

func crawlAndStoreComments(ctx context.Context, q *db.Queries, sub string, posts []Post, maxDepth int) error {
	totalInserted := 0
	totalSkipped := 0
	authorSet := make(map[string]bool)

	for _, post := range posts {
		postID := utils.ExtractPostID(post.Permalink)
		comments, err := CrawlComments(postID)
		if err != nil {
			log.Printf("⚠️ Failed to fetch comments for %s: %v", post.Permalink, err)
			continue
		}

		log.Printf("💬 Post: %s — %d comments", post.Title, len(comments))

		inserted := map[string]bool{}
		pending := map[string]db.UpsertCommentParams{}

		// First pass
		for _, c := range comments {
			if c.Author == "" || c.Author == "[deleted]" || c.Depth > maxDepth {
				totalSkipped++
				continue
			}

			if err := q.UpsertUser(ctx, c.Author); err != nil {
				log.Printf("⚠️ failed to upsert user %s: %v", c.Author, err)
				totalSkipped++
				continue
			}

			authorSet[c.Author] = true

			parentID := utils.StripPrefix(c.ParentID)
			params := db.UpsertCommentParams{
				ID:        c.ID,
				PostID:    postID,
				Author:    c.Author,
				Subreddit: sub,
				Body:      sql.NullString{String: c.Body, Valid: c.Body != ""},
				ParentID:  sql.NullString{String: parentID, Valid: parentID != ""},
				Depth:     sql.NullInt32{Int32: int32(c.Depth), Valid: true},
			}

			if parentID == "" || inserted[parentID] {
				if err := q.UpsertComment(ctx, params); err == nil {
					inserted[c.ID] = true
					totalInserted++
				} else {
					log.Printf("⚠️ failed to insert comment %s: %v", c.ID, err)
					totalSkipped++
				}
			} else {
				pending[c.ID] = params
			}
		}

		// Second pass for orphans
		for id, params := range pending {
			if inserted[utils.StripPrefix(params.ParentID.String)] {
				if err := q.UpsertComment(ctx, params); err == nil {
					inserted[id] = true
					totalInserted++
				} else {
					log.Printf("⚠️ second pass failed for comment %s: %v", id, err)
					totalSkipped++
				}
			}
		}
	}

	// Trigger discovery from authors
	var authors []string
	for author := range authorSet {
		authors = append(authors, author)
	}
	FetchAndQueueUserSubredditsForAuthors(ctx, q, authors, FetchUserSubredditsConfig{
		Limit:      utils.GetEnvAsInt("USER_SUB_LIMIT", 30),
		MaxEnqueue: utils.GetEnvAsInt("USER_SUB_MAX_ENQUEUE", 5),
		Enabled:    utils.GetEnvAsBool("USER_SUB_ENABLED", true),
	})

	log.Printf("✅ Comments inserted: %d, Skipped: %d", totalInserted, totalSkipped)
	return nil
}

func enqueueLinkedSubreddits(ctx context.Context, q *db.Queries, posts []Post) {
	linked := extractMentionedSubreddits(posts)
	log.Printf("🔗 Found %d linked subreddits", len(linked))

	for _, sub := range linked {
		if err := q.EnqueueCrawlJob(ctx, sub); err != nil {
			log.Printf("⚠️ Failed to enqueue %s: %v", sub, err)
		}
	}
}