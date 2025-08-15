package graph

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strconv"
	"strings"

	"github.com/onnwee/reddit-cluster-map/backend/internal/config"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

type Service struct {
	store GraphStore
}

// GraphStore defines DB operations used by Service.
type GraphStore interface {
	// Cleanup
	ClearSubredditRelationships(ctx context.Context) error
	ClearUserSubredditActivity(ctx context.Context) error
	ClearGraphTables(ctx context.Context) error
	// Reads
	GetAllSubreddits(ctx context.Context) ([]db.GetAllSubredditsRow, error)
	GetAllUsers(ctx context.Context) ([]db.GetAllUsersRow, error)
	GetAllSubredditRelationships(ctx context.Context) ([]db.GetAllSubredditRelationshipsRow, error)
	GetAllUserSubredditActivity(ctx context.Context) ([]db.GetAllUserSubredditActivityRow, error)
	// Overlap + activity
	GetSubredditOverlap(ctx context.Context, arg db.GetSubredditOverlapParams) (int64, error)
	CreateSubredditRelationship(ctx context.Context, arg db.CreateSubredditRelationshipParams) (db.SubredditRelationship, error)
	GetUserSubreddits(ctx context.Context, authorID int32) ([]db.GetUserSubredditsRow, error)
	GetUserSubredditActivityCount(ctx context.Context, arg db.GetUserSubredditActivityCountParams) (int32, error)
	CreateUserSubredditActivity(ctx context.Context, arg db.CreateUserSubredditActivityParams) (db.UserSubredditActivity, error)
	// Graph data
	BulkInsertGraphNode(ctx context.Context, arg db.BulkInsertGraphNodeParams) error
	BulkInsertGraphLink(ctx context.Context, arg db.BulkInsertGraphLinkParams) error
	// Detailed content
	ListPostsBySubreddit(ctx context.Context, arg db.ListPostsBySubredditParams) ([]db.Post, error)
	ListCommentsByPost(ctx context.Context, postID string) ([]db.Comment, error)
	GetUserTotalActivity(ctx context.Context, authorID int32) (int32, error)
}

func NewService(store GraphStore) *Service {
	return &Service{store: store}
}

// CalculateSubredditRelationships calculates relationships between subreddits based on user overlap
func (s *Service) CalculateSubredditRelationships(ctx context.Context) error {
	log.Printf("🔄 Starting subreddit relationship calculation")
	
	// Clear existing relationships
	if err := s.store.ClearSubredditRelationships(ctx); err != nil {
		return fmt.Errorf("failed to clear subreddit relationships: %w", err)
	}
	log.Printf("🧹 Cleared existing subreddit relationships")

	// Get all subreddits
	subreddits, err := s.store.GetAllSubreddits(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch subreddits: %w", err)
	}
	log.Printf("📊 Processing %d subreddits for relationships", len(subreddits))

	// For each pair of subreddits, calculate user overlap
	relationshipCount := 0
	for i, s1 := range subreddits {
		log.Printf("Processing subreddit %d/%d: r/%s", i, len(subreddits), s1.Name)
		for j := i + 1; j < len(subreddits); j++ {
			s2 := subreddits[j]
			// Get users who posted/commented in both subreddits
			overlap, err := s.store.GetSubredditOverlap(ctx, db.GetSubredditOverlapParams{
				SubredditID:   s1.ID,
				SubredditID_2: s2.ID,
			})
			if err != nil {
				log.Printf("⚠️ Failed to calculate overlap between r/%s and r/%s: %v", s1.Name, s2.Name, err)
				continue
			}

			if overlap > 0 {
				// Insert relationship in both directions
				_, err := s.store.CreateSubredditRelationship(ctx, db.CreateSubredditRelationshipParams{
					SourceSubredditID: s1.ID,
					TargetSubredditID: s2.ID,
					OverlapCount:      int32(overlap),
				})
				if err != nil {
					log.Printf("⚠️ Failed to create relationship from r/%s to r/%s: %v", s1.Name, s2.Name, err)
					continue
				}

				_, err = s.store.CreateSubredditRelationship(ctx, db.CreateSubredditRelationshipParams{
					SourceSubredditID: s2.ID,
					TargetSubredditID: s1.ID,
					OverlapCount:      int32(overlap),
				})
				if err != nil {
					log.Printf("⚠️ Failed to create relationship from r/%s to r/%s: %v", s2.Name, s1.Name, err)
					continue
				}
				relationshipCount++
			}
		}
	}
	log.Printf("✅ Created %d subreddit relationships", relationshipCount)
	return nil
}

// CalculateUserActivity calculates user activity in subreddits
func (s *Service) CalculateUserActivity(ctx context.Context) error {
	log.Printf("🔄 Starting user activity calculation")
	
	// Clear existing activity data
	if err := s.store.ClearUserSubredditActivity(ctx); err != nil {
		return fmt.Errorf("failed to clear user activity: %w", err)
	}
	log.Printf("🧹 Cleared existing user activity data")

	// Get all users
	users, err := s.store.GetAllUsers(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch users: %w", err)
	}
	log.Printf("👥 Processing activity for %d users", len(users))

	activityCount := 0
	// For each user, calculate their activity in each subreddit
	for _, user := range users {
		// Get all subreddits where the user has posted or commented
	subreddits, err := s.store.GetUserSubreddits(ctx, user.ID)
		if err != nil {
			log.Printf("⚠️ Failed to get subreddits for user %s: %v", user.Username, err)
			continue
		}

		for _, subreddit := range subreddits {
			// Calculate total activity (posts + comments)
			activity, err := s.store.GetUserSubredditActivityCount(ctx, db.GetUserSubredditActivityCountParams{
				AuthorID:    user.ID,
				SubredditID: subreddit.ID,
			})
			if err != nil {
				log.Printf("⚠️ Failed to calculate activity for user %s in r/%s: %v", user.Username, subreddit.Name, err)
				continue
			}

			if activity > 0 {
				_, err := s.store.CreateUserSubredditActivity(ctx, db.CreateUserSubredditActivityParams{
					UserID:        user.ID,
					SubredditID:   subreddit.ID,
					ActivityCount: activity,
				})
				if err != nil {
					log.Printf("⚠️ Failed to create activity record for user %s in r/%s: %v", user.Username, subreddit.Name, err)
					continue
				}
				activityCount++
			}
		}
	}
	log.Printf("✅ Created %d user activity records", activityCount)
	return nil
}

// PrecalculateGraphData precalculates the graph data and stores it in the database.
func (s *Service) PrecalculateGraphData(ctx context.Context) error {
	log.Printf("🔄 Starting graph data precalculation")
	
	// First calculate relationships and activity
	if err := s.CalculateSubredditRelationships(ctx); err != nil {
		return fmt.Errorf("failed to calculate subreddit relationships: %w", err)
	}

	if err := s.CalculateUserActivity(ctx); err != nil {
		return fmt.Errorf("failed to calculate user activity: %w", err)
	}

	// Clear existing graph data
	if err := s.store.ClearGraphTables(ctx); err != nil {
		return fmt.Errorf("failed to clear graph tables: %w", err)
	}
	log.Printf("🧹 Cleared existing graph data")

	// Env toggles and limits for detailed content graph
	cfg := config.Load()
	detailed := cfg.DetailedGraph
	postsPerSub := int32(cfg.PostsPerSubInGraph)
	commentsPerPost := int(cfg.CommentsPerPost)

	// Create user nodes first (so user->post/comment links will be valid later)
	users, err := s.store.GetAllUsers(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch users: %w", err)
	}
	log.Printf("👥 Creating nodes for %d users", len(users))

	userNodeCount := 0
	for _, user := range users {
		// Calculate total activity
	activity, err := s.store.GetUserTotalActivity(ctx, user.ID)
		if err != nil {
			log.Printf("⚠️ Failed to calculate total activity for user %s: %v", user.Username, err)
			continue
		}

	err = s.store.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
			ID:   fmt.Sprintf("user_%d", user.ID),
			Name: user.Username,
			Val:  sql.NullString{String: strconv.FormatInt(int64(activity), 10), Valid: true},
			Type: sql.NullString{String: "user", Valid: true},
		})
		if err != nil {
			log.Printf("⚠️ Failed to insert user node for %s: %v", user.Username, err)
			continue
		}
		userNodeCount++
	}
	log.Printf("✅ Created %d user nodes", userNodeCount)

	// Get all subreddits and create nodes
	subreddits, err := s.store.GetAllSubreddits(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch subreddits: %w", err)
	}
	log.Printf("📊 Creating nodes for %d subreddits", len(subreddits))

	subredditNodeCount := 0
	for _, subreddit := range subreddits {
		var subscribers sql.NullString
		if subreddit.Subscribers.Valid {
			subscribers = sql.NullString{String: strconv.FormatInt(int64(subreddit.Subscribers.Int32), 10), Valid: true}
		}
	err := s.store.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
			ID:   fmt.Sprintf("subreddit_%d", subreddit.ID),
			Name: subreddit.Name,
			Val:  subscribers,
			Type: sql.NullString{String: "subreddit", Valid: true},
		})
		if err != nil {
			log.Printf("⚠️ Failed to insert subreddit node for r/%s: %v", subreddit.Name, err)
			continue
		}
		subredditNodeCount++
	}
	log.Printf("✅ Created %d subreddit nodes", subredditNodeCount)

	// Optionally: create post and comment nodes and edges
	type authoredPost struct {
		postID   string
		authorID int32
	}
	type authoredComment struct {
		commentID string
		authorID  int32
		postID    string
	}
	var authoredPosts []authoredPost
	var authoredComments []authoredComment

	if detailed {
		log.Printf("🧩 Building detailed content graph: posts and comments")
		// For each subreddit, add up to postsPerSub posts
	// Track mappings for later direct cross-links
	postToSub := map[string]int32{}
	commentToSub := map[string]int32{}
		for _, sr := range subreddits {
			posts, err := s.store.ListPostsBySubreddit(ctx, db.ListPostsBySubredditParams{SubredditID: sr.ID, Limit: postsPerSub, Offset: 0})
			if err != nil {
				log.Printf("⚠️ Failed to list posts for r/%s: %v", sr.Name, err)
				continue
			}
			for _, p := range posts {
				// Node for post
				title := strings.TrimSpace(p.Title.String)
				if title == "" {
					title = fmt.Sprintf("post %s", p.ID)
				}
				var scoreStr sql.NullString
				if p.Score.Valid {
					scoreStr = sql.NullString{String: strconv.FormatInt(int64(p.Score.Int32), 10), Valid: true}
				}
				if err := s.store.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
					ID:   fmt.Sprintf("post_%s", p.ID),
					Name: title,
					Val:  scoreStr,
					Type: sql.NullString{String: "post", Valid: true},
				}); err != nil {
					log.Printf("⚠️ Failed to insert post node %s: %v", p.ID, err)
					continue
				}
				// Edge subreddit -> post
				if err := s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{
					Source: fmt.Sprintf("subreddit_%d", sr.ID),
					Target: fmt.Sprintf("post_%s", p.ID),
				}); err != nil {
					log.Printf("⚠️ Failed to link subreddit->post (%s): %v", p.ID, err)
				}
				postToSub[p.ID] = sr.ID
				authoredPosts = append(authoredPosts, authoredPost{postID: p.ID, authorID: p.AuthorID})

				// Comments for this post (cap)
				comments, err := s.store.ListCommentsByPost(ctx, p.ID)
				if err != nil {
					log.Printf("⚠️ Failed to list comments for post %s: %v", p.ID, err)
					continue
				}
				// First pass: insert comment nodes (respect limit)
				inserted := map[string]bool{}
				count := 0
				for _, c := range comments {
					if count >= commentsPerPost {
						break
					}
					cid := c.ID
					name := strings.TrimSpace(c.Body.String)
					if name == "" {
						name = fmt.Sprintf("comment %s", cid)
					}
					var scoreStr sql.NullString
					if c.Score.Valid {
						scoreStr = sql.NullString{String: strconv.FormatInt(int64(c.Score.Int32), 10), Valid: true}
					}
					if err := s.store.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
						ID:   fmt.Sprintf("comment_%s", cid),
						Name: name,
						Val:  scoreStr,
						Type: sql.NullString{String: "comment", Valid: true},
					}); err != nil {
						log.Printf("⚠️ Failed to insert comment node %s: %v", cid, err)
						continue
					}
					inserted[cid] = true
					commentToSub[cid] = c.SubredditID
					authoredComments = append(authoredComments, authoredComment{commentID: cid, authorID: c.AuthorID, postID: p.ID})
					count++
				}
				// Second pass: insert edges for comment parents
				count = 0
				for _, c := range comments {
					if count >= commentsPerPost {
						break
					}
					cid := c.ID
					parent := strings.TrimSpace(c.ParentID.String)
					parentID := parent
					if strings.HasPrefix(parentID, "t1_") || strings.HasPrefix(parentID, "t3_") {
						parentID = parentID[3:]
					}
					// Prefer comment->comment if parent comment exists, else post->comment
					if strings.HasPrefix(parent, "t1_") && inserted[parentID] {
						_ = s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{
							Source: fmt.Sprintf("comment_%s", parentID),
							Target: fmt.Sprintf("comment_%s", cid),
						})
					} else {
						_ = s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{
							Source: fmt.Sprintf("post_%s", p.ID),
							Target: fmt.Sprintf("comment_%s", cid),
						})
					}
					count++
				}
			}
		}
		// Build direct cross-links among content by same author across different subreddits
		maxLinks := cfg.MaxAuthorLinks
		if maxLinks > 0 {
			// Build per-author content lists with subtype and subreddit id
			type item struct {
				id        string
				kind      string // "post" or "comment"
				subreddit int32
			}
			byAuthor := map[int32][]item{}
			for _, ap := range authoredPosts {
				if subID, ok := postToSub[ap.postID]; ok {
					byAuthor[ap.authorID] = append(byAuthor[ap.authorID], item{id: ap.postID, kind: "post", subreddit: subID})
				}
			}
			for _, ac := range authoredComments {
				if subID, ok := commentToSub[ac.commentID]; ok {
					byAuthor[ac.authorID] = append(byAuthor[ac.authorID], item{id: ac.commentID, kind: "comment", subreddit: subID})
				}
			}
			// Create limited outgoing links per item to items in other subreddits
			made := 0
			linkSeen := map[string]bool{}
			for _, items := range byAuthor {
				for i := range items {
					src := items[i]
					links := 0
					for j := range items {
						if i == j || links >= maxLinks {
							continue
						}
						dst := items[j]
						if src.subreddit == dst.subreddit {
							continue
						}
						srcID := fmt.Sprintf("%s_%s", src.kind, src.id)
						dstID := fmt.Sprintf("%s_%s", dst.kind, dst.id)
						key := srcID + "->" + dstID
						if linkSeen[key] {
							continue
						}
						if err := s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{Source: srcID, Target: dstID}); err == nil {
							linkSeen[key] = true
							links++
							made++
						}
					}
				}
			}
			log.Printf("🔗 Added %d direct content-to-content links across subs (per-node cap=%d)", made, maxLinks)
		}
	}

	// Create links for subreddit relationships
	relationships, err := s.store.GetAllSubredditRelationships(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch relationships: %w", err)
	}
	log.Printf("🔗 Creating %d subreddit relationship links", len(relationships))

	relationshipLinkCount := 0
	for _, rel := range relationships {
	err := s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{
			Source: fmt.Sprintf("subreddit_%d", rel.SourceSubredditID),
			Target: fmt.Sprintf("subreddit_%d", rel.TargetSubredditID),
		})
		if err != nil {
			log.Printf("⚠️ Failed to insert relationship link: %v", err)
			continue
		}
		relationshipLinkCount++
	}
	log.Printf("✅ Created %d subreddit relationship links", relationshipLinkCount)

	// Create links for user activity
	activities, err := s.store.GetAllUserSubredditActivity(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch activities: %w", err)
	}
	log.Printf("🔗 Creating %d user activity links", len(activities))

	activityLinkCount := 0
	for _, activity := range activities {
	err := s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{
			Source: fmt.Sprintf("user_%d", activity.UserID),
			Target: fmt.Sprintf("subreddit_%d", activity.SubredditID),
		})
		if err != nil {
			log.Printf("⚠️ Failed to insert activity link: %v", err)
			continue
		}
		activityLinkCount++
	}
	log.Printf("✅ Created %d user activity links", activityLinkCount)
	// Optionally: links from user to posts/comments to stitch cross-subreddit content
	if detailed {
		upost := 0
		for _, ap := range authoredPosts {
			if err := s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{
				Source: fmt.Sprintf("user_%d", ap.authorID),
				Target: fmt.Sprintf("post_%s", ap.postID),
			}); err == nil {
				upost++
			}
		}
		ucom := 0
		for _, ac := range authoredComments {
			if err := s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{
				Source: fmt.Sprintf("user_%d", ac.authorID),
				Target: fmt.Sprintf("comment_%s", ac.commentID),
			}); err == nil {
				ucom++
			}
		}
		log.Printf("🔗 Added %d user→post and %d user→comment links", upost, ucom)
	}

	log.Printf("🎉 Graph data precalculation completed successfully")
	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
} 