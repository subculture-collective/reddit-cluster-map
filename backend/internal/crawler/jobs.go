package crawler

import (
	"context"
	"database/sql"
	"log"
	"strings"
	"time"

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
	startTime := time.Now()
	log.Printf("🕷️ Starting crawl job #%d", job.ID)

	// Get subreddit name from ID
	subreddit, err := q.GetSubredditByID(ctx, job.SubredditID)
	if err != nil {
		log.Printf("⚠️ Failed to get subreddit with ID %d: %v", job.SubredditID, err)
		return err
	}

	log.Printf("📊 Crawling r/%s", subreddit.Name)
	info, posts, err := CrawlSubreddit(subreddit.Name)
	if err != nil {
		log.Printf("❌ Failed to crawl r/%s: %v", subreddit.Name, err)
		return err
	}

	log.Printf("✅ r/%s: %d posts, %d subs", subreddit.Name, len(posts), info.Subscribers)

	// Update subreddit info
	_, err = q.UpsertSubreddit(ctx, db.UpsertSubredditParams{
		Name:        subreddit.Name,
		Title:       sql.NullString{String: info.Title, Valid: info.Title != ""},
		Description: sql.NullString{String: info.Description, Valid: info.Description != ""},
		Subscribers: sql.NullInt32{Int32: int32(info.Subscribers), Valid: info.Subscribers >= 0},
	})
	if err != nil {
		log.Printf("⚠️ Failed to upsert subreddit r/%s: %v", subreddit.Name, err)
		return err
	}
	log.Printf("✅ Updated subreddit r/%s", subreddit.Name)

	if len(posts) > MaxPostsPerSubreddit {
		log.Printf("📝 Limiting posts from %d to %d", len(posts), MaxPostsPerSubreddit)
		posts = posts[:MaxPostsPerSubreddit]
	}

	insertedPosts, err := crawlAndStorePosts(ctx, q, job.SubredditID, posts)
	if err != nil {
		log.Printf("⚠️ Failed to crawl and store posts: %v", err)
		return err
	}
	log.Printf("✅ Stored %d posts", len(insertedPosts))

	if err := crawlAndStoreComments(ctx, q, job.SubredditID, posts, utils.GetEnvAsInt("MAX_COMMENT_DEPTH", 5), insertedPosts); err != nil {
		log.Printf("⚠️ Failed to crawl and store comments: %v", err)
		return err
	}

	enqueueLinkedSubreddits(ctx, q, posts)

	duration := time.Since(startTime)
	log.Printf("🎉 Completed crawl job #%d for r/%s in %v", job.ID, subreddit.Name, duration)
	return nil
}

func crawlAndStorePosts(ctx context.Context, q *db.Queries, subredditID int32, posts []Post) (map[string]bool, error) {
	insertedPosts := make(map[string]bool)
	skippedPosts := 0
	insertedCount := 0

	for _, post := range posts {
		if post.Author == "" || post.Author == "[deleted]" {
			skippedPosts++
			continue
		}

		// Get or create user
		if err := q.UpsertUser(ctx, post.Author); err != nil {
			log.Printf("⚠️ Failed to upsert user %s: %v", post.Author, err)
			skippedPosts++
			continue
		}

		// Get user ID
		user, err := q.GetUser(ctx, post.Author)
		if err != nil {
			log.Printf("⚠️ Failed to get user %s: %v", post.Author, err)
			skippedPosts++
			continue
		}

		params := ToUpsertPostParams(post, subredditID, user.ID)
		if err := q.UpsertPost(ctx, params); err != nil {
			log.Printf("⚠️ Failed to upsert post (ID=%s, Author=%s): %v", post.ID, post.Author, err)
			skippedPosts++
		} else {
			insertedPosts[post.ID] = true
			insertedCount++
		}
	}

	log.Printf("📝 Posts: %d inserted, %d skipped", insertedCount, skippedPosts)
	return insertedPosts, nil
}

func crawlAndStoreComments(
	ctx context.Context,
	q *db.Queries,
	subredditID int32,
	posts []Post,
	maxDepth int,
	insertedPosts map[string]bool,
) error {
	authorSet := make(map[string]bool)
	totalComments := 0
	totalSkipped := 0

	for _, post := range posts {
		insertedThisPost := 0
		skippedThisPost := 0

		postID := utils.ExtractPostID(post.Permalink)

		// Skip if post wasn't inserted
		if !insertedPosts[postID] {
			log.Printf("⚠️ Skipping comments for post %s — post not found", postID)
			continue
		}

		comments, err := CrawlComments(postID)
		if err != nil {
			log.Printf("⚠️ Failed to fetch comments for %s: %v", post.Permalink, err)
			continue
		}

		log.Printf("💬 Post: %s — %d comments", post.Title, len(comments))
		totalComments += len(comments)

		inserted := map[string]bool{}
		pending := map[string]db.UpsertCommentParams{}

		// First pass
		for _, c := range comments {
			if !utils.IsValidAuthor(c.Author) || c.Depth > maxDepth {
				skippedThisPost++
				continue
			}

			// Get or create user
			if err := q.UpsertUser(ctx, c.Author); err != nil {
				log.Printf("⚠️ Failed to upsert user %s: %v", c.Author, err)
				skippedThisPost++
				continue
			}

			// Get user ID
			user, err := q.GetUser(ctx, c.Author)
			if err != nil {
				log.Printf("⚠️ Failed to get user %s: %v", c.Author, err)
				skippedThisPost++
				continue
			}

			authorSet[c.Author] = true

			parentID := utils.StripPrefix(c.ParentID)
			params := ToUpsertCommentParams(c, postID, subredditID, user.ID)

			if parentID == "" || strings.HasPrefix(c.ParentID, "t3_") || inserted[parentID] {
				if err := q.UpsertComment(ctx, params); err == nil {
					inserted[c.ID] = true
					insertedThisPost++
				} else {
					log.Printf("⚠️ Failed to insert comment %s: %v", c.ID, err)
					skippedThisPost++
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
					insertedThisPost++
				} else {
					log.Printf("⚠️ Second pass failed for comment %s: %v", id, err)
					skippedThisPost++
				}
			}
		}

		log.Printf("💬 Post %s: Comments inserted: %d, Skipped: %d", postID, insertedThisPost, skippedThisPost)
		totalSkipped += skippedThisPost
	}

	log.Printf("💬 Total comments processed: %d, Total skipped: %d", totalComments, totalSkipped)

	// Trigger discovery from authors
	var authors []string
	for author := range authorSet {
		authors = append(authors, author)
	}
	log.Printf("👥 Found %d unique authors to process", len(authors))

	FetchAndQueueUserSubredditsForAuthors(ctx, q, authors, FetchUserSubredditsConfig{
		Limit:      utils.GetEnvAsInt("USER_SUB_FETCH_LIMIT", 30),
		MaxEnqueue: utils.GetEnvAsInt("USER_SUB_ENQUEUE_MAX", 10),
		Enabled:    utils.GetEnvAsBool("FETCH_USER_SUBREDDITS", true),
	})

	return nil
}

func enqueueLinkedSubreddits(ctx context.Context, q *db.Queries, posts []Post) {
	linked := extractMentionedSubreddits(posts)
	log.Printf("🔗 Found %d linked subreddits", len(linked))

	enqueuedCount := 0
	for _, sub := range linked {
		// First get or create the subreddit
		subreddit, err := q.UpsertSubreddit(ctx, db.UpsertSubredditParams{
			Name:        sub,
			Title:       sql.NullString{String: sub, Valid: true},
			Description: sql.NullString{String: "", Valid: true},
			Subscribers: sql.NullInt32{Int32: 0, Valid: true},
		})
		if err != nil {
			log.Printf("⚠️ Failed to upsert subreddit %s: %v", sub, err)
			continue
		}

		// Then enqueue the crawl job
		if err := q.EnqueueCrawlJob(ctx, db.EnqueueCrawlJobParams{
			SubredditID: subreddit,
			EnqueuedBy:  sql.NullString{String: "crawler", Valid: true},
		}); err != nil {
			log.Printf("⚠️ Failed to enqueue %s: %v", sub, err)
		} else {
			enqueuedCount++
		}
	}
	log.Printf("✅ Enqueued %d/%d linked subreddits", enqueuedCount, len(linked))
}