package graph

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"unicode/utf8"

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
	ListUsersWithActivity(ctx context.Context) ([]db.ListUsersWithActivityRow, error)
	// Detailed content
	ListPostsBySubreddit(ctx context.Context, arg db.ListPostsBySubredditParams) ([]db.Post, error)
	ListCommentsByPost(ctx context.Context, postID string) ([]db.Comment, error)
	GetUserTotalActivity(ctx context.Context, authorID int32) (int32, error)
}

func NewService(store GraphStore) *Service { return &Service{store: store} }

// truncateUTF8 returns a string with at most max runes, preserving valid UTF-8 boundaries.
func truncateUTF8(s string, max int) string {
	if max <= 0 || s == "" {
		return ""
	}
	i := 0
	for idx := range s { // idx is start byte index of the next rune
		if i == max {
			return s[:idx]
		}
		i++
	}
	return s
}

// CalculateSubredditRelationships via user activity co-occurrence (incremental upsert)
func (s *Service) CalculateSubredditRelationships(ctx context.Context) error {
	log.Printf("🔄 Starting subreddit relationship calculation (via co-occurrence)")

	acts, err := s.store.GetAllUserSubredditActivity(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch user activity for relationships: %w", err)
	}
	if len(acts) == 0 {
		log.Printf("ℹ️ No user activity yet; skipping relationships")
		return nil
	}

	// Group subreddit ids per user
	perUser := make(map[int32][]int32, 1024)
	for _, a := range acts {
		perUser[a.UserID] = append(perUser[a.UserID], a.SubredditID)
	}

	// Count unordered pairs
	type pair struct{ a, b int32 }
	counts := make(map[pair]int32, 4096)
	for _, subs := range perUser {
		if len(subs) == 0 {
			continue
		}
		seen := make(map[int32]struct{}, len(subs))
		uniq := make([]int32, 0, len(subs))
		for _, id := range subs {
			if _, ok := seen[id]; !ok {
				seen[id] = struct{}{}
				uniq = append(uniq, id)
			}
		}
		for i := 0; i < len(uniq); i++ {
			for j := i + 1; j < len(uniq); j++ {
				a, b := uniq[i], uniq[j]
				if a > b {
					a, b = b, a
				}
				counts[pair{a, b}]++
			}
		}
	}

	upserts := 0
	for p, c := range counts {
		if c <= 0 {
			continue
		}
		if _, err := s.store.CreateSubredditRelationship(ctx, db.CreateSubredditRelationshipParams{SourceSubredditID: p.a, TargetSubredditID: p.b, OverlapCount: c}); err != nil {
			log.Printf("⚠️ relationship upsert %d->%d failed: %v", p.a, p.b, err)
		} else {
			upserts++
		}
		if _, err := s.store.CreateSubredditRelationship(ctx, db.CreateSubredditRelationshipParams{SourceSubredditID: p.b, TargetSubredditID: p.a, OverlapCount: c}); err != nil {
			log.Printf("⚠️ relationship upsert %d->%d failed: %v", p.b, p.a, err)
		} else {
			upserts++
		}
	}
	log.Printf("✅ Upserted %d subreddit relationship rows", upserts)
	return nil
}

// CalculateUserActivity computes per-user subreddit activity (parallel) and incrementally inserts user→subreddit links
func (s *Service) CalculateUserActivity(ctx context.Context) error {
	log.Printf("🔄 Starting user activity calculation")
	if err := s.store.ClearUserSubredditActivity(ctx); err != nil {
		return fmt.Errorf("failed to clear user activity: %w", err)
	}
	log.Printf("🧹 Cleared existing user activity data")

	users, err := s.store.GetAllUsers(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch users: %w", err)
	}
	if len(users) == 0 {
		log.Printf("ℹ️ No users found for activity calculation")
		return nil
	}

	// Determine workers
	workers := 4
	if wStr := os.Getenv("PRECALC_ACTIVITY_WORKERS"); wStr != "" {
		if w, err := strconv.Atoi(wStr); err == nil && w > 0 {
			workers = w
		}
	} else if p := runtime.GOMAXPROCS(0); p > 0 && p < workers {
		workers = p
	}
	if workers > len(users) {
		workers = len(users)
	}
	if workers < 1 {
		workers = 1
	}
	log.Printf("⚙️ Calculating activity with %d workers", workers)

	var total int64
	userCh := make(chan db.GetAllUsersRow, workers*2)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for u := range userCh {
				select {
				case <-ctx.Done():
					return
				default:
				}
				subs, err := s.store.GetUserSubreddits(ctx, u.ID)
				if err != nil {
					log.Printf("⚠️ GetUserSubreddits %s: %v", u.Username, err)
					continue
				}
				for _, sr := range subs {
					act, err := s.store.GetUserSubredditActivityCount(ctx, db.GetUserSubredditActivityCountParams{AuthorID: u.ID, SubredditID: sr.ID})
					if err != nil {
						log.Printf("⚠️ GetUserSubredditActivityCount %s r/%s: %v", u.Username, sr.Name, err)
						continue
					}
					if act <= 0 {
						continue
					}
					if _, err := s.store.CreateUserSubredditActivity(ctx, db.CreateUserSubredditActivityParams{UserID: u.ID, SubredditID: sr.ID, ActivityCount: act}); err != nil {
						log.Printf("⚠️ CreateUserSubredditActivity %s r/%s: %v", u.Username, sr.Name, err)
						continue
					}
					// Note: Defer user→subreddit link insertion until after nodes exist to satisfy FKs
					atomic.AddInt64(&total, 1)
				}
			}
		}()
	}
	for _, u := range users {
		userCh <- u
	}
	close(userCh)
	wg.Wait()
	log.Printf("✅ Created %d user activity records", total)
	return nil
}

// PrecalculateGraphData builds nodes and links. It preserves existing graph rows unless PRECALC_CLEAR_ON_START is set.
func (s *Service) PrecalculateGraphData(ctx context.Context) error {
	log.Printf("🔄 Starting graph data precalculation")

	// Optional clear on start (must happen before node/link inserts)
	if config.Load().GetEnvBool("PRECALC_CLEAR_ON_START", false) {
		if err := s.store.ClearGraphTables(ctx); err != nil {
			return fmt.Errorf("failed to clear graph tables: %w", err)
		}
		log.Printf("🧹 Cleared existing graph data (requested)")
	} else {
		log.Printf("ℹ️ Preserving existing graph data; running incremental precalc")
	}

	cfg := config.Load()
	detailed := cfg.DetailedGraph
	postsPerSub := int32(cfg.PostsPerSubInGraph)
	commentsPerPost := int(cfg.CommentsPerPost)

	// Users -> nodes (aggregate totals in a single query to avoid per-user COUNTs)
	usersWithActivity, err := s.store.ListUsersWithActivity(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch user activity totals: %w", err)
	}
	log.Printf("👥 Creating nodes for %d users", len(usersWithActivity))
	userNodeCount := 0
	for _, u := range usersWithActivity {
		total := int64(u.TotalActivity)
		val := sql.NullString{Valid: true, String: strconv.FormatInt(total, 10)}
		if err := s.store.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{ID: fmt.Sprintf("user_%d", u.ID), Name: u.Username, Val: val, Type: sql.NullString{String: "user", Valid: true}}); err != nil {
			log.Printf("⚠️ insert user node %s: %v", u.Username, err)
			continue
		}
		userNodeCount++
	}
	log.Printf("✅ Created %d user nodes", userNodeCount)

	// Subreddits -> nodes
	subreddits, err := s.store.GetAllSubreddits(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch subreddits: %w", err)
	}
	log.Printf("📊 Creating nodes for %d subreddits", len(subreddits))
	subNodeCount := 0
	for _, sr := range subreddits {
		var subs sql.NullString
		if sr.Subscribers.Valid {
			subs = sql.NullString{String: strconv.FormatInt(int64(sr.Subscribers.Int32), 10), Valid: true}
		}
		if err := s.store.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{ID: fmt.Sprintf("subreddit_%d", sr.ID), Name: sr.Name, Val: subs, Type: sql.NullString{String: "subreddit", Valid: true}}); err != nil {
			log.Printf("⚠️ insert subreddit node r/%s: %v", sr.Name, err)
			continue
		}
		subNodeCount++
	}
	log.Printf("✅ Created %d subreddit nodes", subNodeCount)

	// After nodes exist, compute activity and relationships so we can safely add links later
	if err := s.CalculateUserActivity(ctx); err != nil {
		return fmt.Errorf("failed to calculate user activity: %w", err)
	}
	if err := s.CalculateSubredditRelationships(ctx); err != nil {
		return fmt.Errorf("failed to calculate subreddit relationships: %w", err)
	}

	// Detailed content graph (optional)
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
	postToSub := map[string]int32{}
	commentToSub := map[string]int32{}

	if detailed {
		log.Printf("🧩 Building detailed content graph: posts and comments")
		for _, sr := range subreddits {
			posts, err := s.store.ListPostsBySubreddit(ctx, db.ListPostsBySubredditParams{SubredditID: sr.ID, Limit: postsPerSub, Offset: 0})
			if err != nil {
				log.Printf("⚠️ list posts r/%s: %v", sr.Name, err)
				continue
			}
			for _, p := range posts {
				title := strings.TrimSpace(p.Title.String)
				if title == "" {
					title = fmt.Sprintf("post %s", p.ID)
				}
				if utf8.RuneCountInString(title) > 256 {
					title = truncateUTF8(title, 256)
				}
				var score sql.NullString
				if p.Score.Valid {
					score = sql.NullString{String: strconv.FormatInt(int64(p.Score.Int32), 10), Valid: true}
				}
				_ = s.store.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{ID: fmt.Sprintf("post_%s", p.ID), Name: title, Val: score, Type: sql.NullString{String: "post", Valid: true}})
				_ = s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("subreddit_%d", sr.ID), Target: fmt.Sprintf("post_%s", p.ID)})
				postToSub[p.ID] = sr.ID
				authoredPosts = append(authoredPosts, authoredPost{postID: p.ID, authorID: p.AuthorID})

				comments, err := s.store.ListCommentsByPost(ctx, p.ID)
				if err != nil {
					log.Printf("⚠️ list comments %s: %v", p.ID, err)
					continue
				}
				inserted := map[string]bool{}
				count := 0
				// First pass: insert up to N comment nodes and record which ones exist
				for _, c := range comments {
					if count >= commentsPerPost {
						break
					}
					cid := c.ID
					name := strings.TrimSpace(c.Body.String)
					if name == "" {
						name = fmt.Sprintf("comment %s", cid)
					}
					if utf8.RuneCountInString(name) > 256 {
						name = truncateUTF8(name, 256)
					}
					var cscore sql.NullString
					if c.Score.Valid {
						cscore = sql.NullString{String: strconv.FormatInt(int64(c.Score.Int32), 10), Valid: true}
					}
					_ = s.store.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{ID: fmt.Sprintf("comment_%s", cid), Name: name, Val: cscore, Type: sql.NullString{String: "comment", Valid: true}})
					inserted[cid] = true
					commentToSub[cid] = c.SubredditID
					authoredComments = append(authoredComments, authoredComment{commentID: cid, authorID: c.AuthorID, postID: p.ID})
					count++
				}
				// Second pass: add links only for comments whose nodes were inserted
				for _, c := range comments {
					cid := c.ID
					if !inserted[cid] {
						continue
					}
					parent := strings.TrimSpace(c.ParentID.String)
					parentID := parent
					if strings.HasPrefix(parentID, "t1_") || strings.HasPrefix(parentID, "t3_") {
						parentID = parentID[3:]
					}
					if strings.HasPrefix(parent, "t1_") && inserted[parentID] {
						_ = s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("comment_%s", parentID), Target: fmt.Sprintf("comment_%s", cid)})
					} else {
						_ = s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("post_%s", p.ID), Target: fmt.Sprintf("comment_%s", cid)})
					}
				}
			}
		}
		// Cross-links among content by same author across different subreddits
		maxLinks := cfg.MaxAuthorLinks
		if maxLinks > 0 {
			type item struct {
				id, kind  string
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
			made := 0
			seen := map[string]bool{}
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
						if seen[key] {
							continue
						}
						if err := s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{Source: srcID, Target: dstID}); err == nil {
							seen[key] = true
							links++
							made++
						}
					}
				}
			}
			log.Printf("🔗 Added %d direct content-to-content links across subs (per-node cap=%d)", made, maxLinks)
		}
	}

	// Subreddit relationships -> links
	relationships, err := s.store.GetAllSubredditRelationships(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch relationships: %w", err)
	}
	relLinks := 0
	for _, rel := range relationships {
		if err := s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("subreddit_%d", rel.SourceSubredditID), Target: fmt.Sprintf("subreddit_%d", rel.TargetSubredditID)}); err == nil {
			relLinks++
		}
	}
	log.Printf("✅ Created %d subreddit relationship links", relLinks)

	// User activity -> links (idempotent)
	acts, err := s.store.GetAllUserSubredditActivity(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch activities: %w", err)
	}
	actLinks := 0
	for _, a := range acts {
		if err := s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("user_%d", a.UserID), Target: fmt.Sprintf("subreddit_%d", a.SubredditID)}); err == nil {
			actLinks++
		}
	}
	log.Printf("✅ Created %d user activity links", actLinks)

	if detailed {
		upost := 0
		for _, ap := range authoredPosts {
			if err := s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("user_%d", ap.authorID), Target: fmt.Sprintf("post_%s", ap.postID)}); err == nil {
				upost++
			}
		}
		ucom := 0
		for _, ac := range authoredComments {
			if err := s.store.BulkInsertGraphLink(ctx, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("user_%d", ac.authorID), Target: fmt.Sprintf("comment_%s", ac.commentID)}); err == nil {
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
