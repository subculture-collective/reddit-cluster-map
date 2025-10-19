package graph

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/onnwee/reddit-cluster-map/backend/internal/config"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

// progressLogger provides periodic progress output based on a modulo interval.
type progressLogger struct {
	name     string
	interval int
	start    time.Time
	count    int
}

func newProgressLogger(name string, interval int) *progressLogger {
	if interval <= 0 {
		interval = 10000
	}
	return &progressLogger{name: name, interval: interval, start: time.Now()}
}
func (p *progressLogger) Inc(n int) {
	p.count += n
	if p.count%p.interval == 0 {
		elapsed := time.Since(p.start)
		rate := float64(p.count) / elapsed.Seconds()
		log.Printf("⏱ %s: %d items (%.0f/sec)", p.name, p.count, rate)
	}
}
func (p *progressLogger) Done(totalLabel string) {
	elapsed := time.Since(p.start)
	rate := float64(p.count) / elapsed.Seconds()
	if totalLabel == "" {
		totalLabel = fmt.Sprintf("%d", p.count)
	}
	log.Printf("✅ %s complete: %s items in %s (%.0f/sec)", p.name, totalLabel, elapsed.Truncate(time.Millisecond), rate)
}

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

	// Users & Subreddits -> nodes (batched upsert inside single transaction for speed)
	usersWithActivity, err := s.store.ListUsersWithActivity(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch user activity totals: %w", err)
	}
	subreddits, err := s.store.GetAllSubreddits(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch subreddits: %w", err)
	}
	log.Printf("👥 Preparing %d user nodes and %d subreddit nodes", len(usersWithActivity), len(subreddits))

	// Configurable node batch size / progress interval via env
	nodeBatchSize := 1000
	if v := os.Getenv("GRAPH_NODE_BATCH_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			nodeBatchSize = n
		}
	}
	progressInterval := 10000
	if v := os.Getenv("GRAPH_PROGRESS_INTERVAL"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			progressInterval = n
		}
	}
	userProg := newProgressLogger("user-nodes", progressInterval)
	subProg := newProgressLogger("subreddit-nodes", progressInterval)

	// Attempt to unwrap underlying *db.Queries for transaction usage
	// If store is *db.Queries we can optimize; otherwise fallback to existing per-row behavior
	q, ok := s.store.(*db.Queries)
	if !ok {
		log.Printf("ℹ️ store is not *db.Queries; falling back to row-by-row inserts")
		userNodeCount := 0
		for _, u := range usersWithActivity {
			total := int64(u.TotalActivity)
			val := sql.NullString{Valid: true, String: strconv.FormatInt(total, 10)}
			if err := s.store.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{ID: fmt.Sprintf("user_%d", u.ID), Name: u.Username, Val: val, Type: sql.NullString{String: "user", Valid: true}}); err == nil {
				userNodeCount++
				userProg.Inc(1)
			}
		}
		subNodeCount := 0
		for _, sr := range subreddits {
			var subs sql.NullString
			if sr.Subscribers.Valid {
				subs = sql.NullString{String: strconv.FormatInt(int64(sr.Subscribers.Int32), 10), Valid: true}
			}
			if err := s.store.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{ID: fmt.Sprintf("subreddit_%d", sr.ID), Name: sr.Name, Val: subs, Type: sql.NullString{String: "subreddit", Valid: true}}); err == nil {
				subNodeCount++
				subProg.Inc(1)
			}
		}
		log.Printf("✅ Created %d user nodes, %d subreddit nodes (fallback mode)", userNodeCount, subNodeCount)
		userProg.Done("")
		subProg.Done("")
	} else {
		start := time.Now()
		nodeParams := make([]db.BulkInsertGraphNodeParams, 0, len(usersWithActivity)+len(subreddits))
		for _, u := range usersWithActivity {
			total := int64(u.TotalActivity)
			val := sql.NullString{Valid: true, String: strconv.FormatInt(total, 10)}
			nodeParams = append(nodeParams, db.BulkInsertGraphNodeParams{ID: fmt.Sprintf("user_%d", u.ID), Name: u.Username, Val: val, Type: sql.NullString{String: "user", Valid: true}})
			userProg.Inc(1)
		}
		for _, sr := range subreddits {
			var subs sql.NullString
			if sr.Subscribers.Valid {
				subs = sql.NullString{String: strconv.FormatInt(int64(sr.Subscribers.Int32), 10), Valid: true}
			}
			nodeParams = append(nodeParams, db.BulkInsertGraphNodeParams{ID: fmt.Sprintf("subreddit_%d", sr.ID), Name: sr.Name, Val: subs, Type: sql.NullString{String: "subreddit", Valid: true}})
			subProg.Inc(1)
		}
		rawDBTX := q.DB()
		if sqldb, ok2 := rawDBTX.(*sql.DB); ok2 {
			tx, err := sqldb.BeginTx(ctx, &sql.TxOptions{})
			if err != nil {
				return fmt.Errorf("begin tx: %w", err)
			}
			txQueries := q.WithTx(tx)
			if err := txQueries.BatchUpsertGraphNodes(ctx, nodeParams, nodeBatchSize); err != nil {
				_ = tx.Rollback()
				return fmt.Errorf("batch upsert nodes: %w", err)
			}
			if err := tx.Commit(); err != nil {
				return fmt.Errorf("commit node tx: %w", err)
			}
		} else {
			if err := q.BatchUpsertGraphNodes(ctx, nodeParams, nodeBatchSize); err != nil {
				return fmt.Errorf("batch upsert nodes: %w", err)
			}
		}
		dur := time.Since(start)
		log.Printf("✅ Upserted %d graph nodes (users+subreddits) in %s", len(nodeParams), dur.Truncate(time.Millisecond))
		userProg.Done("")
		subProg.Done("")
	}

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

	var pendingLinks []db.BulkInsertGraphLinkParams
	var pendingNodes []db.BulkInsertGraphNodeParams
	linkBatchSize := 2000
	if v := os.Getenv("GRAPH_LINK_BATCH_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			linkBatchSize = n
		}
	}
	linkProg := newProgressLogger("graph-links", progressInterval)
	flushLinks := func(force bool) {
		if len(pendingLinks) == 0 {
			return
		}
		if !force && len(pendingLinks) < linkBatchSize {
			return
		}
		if q2, ok2 := s.store.(*db.Queries); ok2 {
			if err := q2.BatchInsertGraphLinks(ctx, pendingLinks, linkBatchSize); err != nil {
				log.Printf("⚠️ batched link insert error: %v (fallback row-by-row)", err)
				for _, l := range pendingLinks {
					_ = s.store.BulkInsertGraphLink(ctx, l)
				}
			} else {
				linkProg.Inc(len(pendingLinks))
			}
		} else {
			for _, l := range pendingLinks {
				_ = s.store.BulkInsertGraphLink(ctx, l)
				linkProg.Inc(1)
			}
		}
		pendingLinks = pendingLinks[:0]
	}

	contentProg := newProgressLogger("content-nodes", progressInterval)
	flushNodes := func(force bool) {
		if len(pendingNodes) == 0 {
			return
		}
		if !force && len(pendingNodes) < nodeBatchSize {
			return
		}
		if q2, ok2 := s.store.(*db.Queries); ok2 {
			if err := q2.BatchUpsertGraphNodes(ctx, pendingNodes, nodeBatchSize); err != nil {
				log.Printf("⚠️ batched node upsert error: %v (fallback row-by-row)", err)
				for _, n := range pendingNodes {
					_ = s.store.BulkInsertGraphNode(ctx, n)
					contentProg.Inc(1)
				}
			} else {
				contentProg.Inc(len(pendingNodes))
			}
		} else {
			for _, n := range pendingNodes {
				_ = s.store.BulkInsertGraphNode(ctx, n)
				contentProg.Inc(1)
			}
		}
		pendingNodes = pendingNodes[:0]
	}

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
				pendingNodes = append(pendingNodes, db.BulkInsertGraphNodeParams{ID: fmt.Sprintf("post_%s", p.ID), Name: title, Val: score, Type: sql.NullString{String: "post", Valid: true}})
				pendingLinks = append(pendingLinks, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("subreddit_%d", sr.ID), Target: fmt.Sprintf("post_%s", p.ID)})
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
					pendingNodes = append(pendingNodes, db.BulkInsertGraphNodeParams{ID: fmt.Sprintf("comment_%s", cid), Name: name, Val: cscore, Type: sql.NullString{String: "comment", Valid: true}})
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
						pendingLinks = append(pendingLinks, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("comment_%s", parentID), Target: fmt.Sprintf("comment_%s", cid)})
					} else {
						pendingLinks = append(pendingLinks, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("post_%s", p.ID), Target: fmt.Sprintf("comment_%s", cid)})
					}
					flushNodes(false)
				}
				// After processing all comments for this post, flush links in batch
				flushLinks(false)
			}
		}
		// Cross-links among content by same author across different subreddits
		// Ensure all content nodes are flushed before adding cross-links to satisfy FK/join checks.
		flushNodes(true)
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
						pendingLinks = append(pendingLinks, db.BulkInsertGraphLinkParams{Source: srcID, Target: dstID})
						seen[key] = true
						links++
						made++
					}
				}
				flushLinks(false)
			}
			log.Printf("🔗 Added %d direct content-to-content links across subs (per-node cap=%d)", made, maxLinks)
		}
		flushNodes(true)
		flushLinks(true)
	}

	// Subreddit relationships -> links
	relationships, err := s.store.GetAllSubredditRelationships(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch relationships: %w", err)
	}
	relLinks := 0
	for _, rel := range relationships {
		pendingLinks = append(pendingLinks, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("subreddit_%d", rel.SourceSubredditID), Target: fmt.Sprintf("subreddit_%d", rel.TargetSubredditID)})
		relLinks++
		if len(pendingLinks)%5000 == 0 {
			flushLinks(false)
		}
	}
	flushLinks(true)
	log.Printf("✅ Queued %d subreddit relationship links", relLinks)

	// User activity -> links (idempotent)
	acts, err := s.store.GetAllUserSubredditActivity(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch activities: %w", err)
	}
	actLinks := 0
	for _, a := range acts {
		pendingLinks = append(pendingLinks, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("user_%d", a.UserID), Target: fmt.Sprintf("subreddit_%d", a.SubredditID)})
		actLinks++
		if len(pendingLinks)%10000 == 0 {
			flushLinks(false)
		}
	}
	flushLinks(true)
	log.Printf("✅ Queued %d user activity links", actLinks)

	if detailed {
		upost := 0
		for _, ap := range authoredPosts {
			pendingLinks = append(pendingLinks, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("user_%d", ap.authorID), Target: fmt.Sprintf("post_%s", ap.postID)})
			upost++
			if len(pendingLinks)%10000 == 0 {
				flushLinks(false)
			}
		}
		ucom := 0
		for _, ac := range authoredComments {
			pendingLinks = append(pendingLinks, db.BulkInsertGraphLinkParams{Source: fmt.Sprintf("user_%d", ac.authorID), Target: fmt.Sprintf("comment_%s", ac.commentID)})
			ucom++
			if len(pendingLinks)%10000 == 0 {
				flushLinks(false)
			}
		}
		flushLinks(true)
		log.Printf("🔗 Added %d user→post and %d user→comment links", upost, ucom)
	}
	linkProg.Done("")

	log.Printf("🎉 Graph data precalculation completed successfully")

	// Optional: compute and store a simple 2D layout for faster client rendering
	if err := s.computeAndStoreLayout(ctx); err != nil {
		log.Printf("⚠️ layout computation failed: %v", err)
	}
	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// checkPositionColumnsExist verifies that graph_nodes has pos_x, pos_y, pos_z columns.
// Returns true if columns exist, false otherwise (with no error).
func (s *Service) checkPositionColumnsExist(ctx context.Context, queries *db.Queries) bool {
	// Query the table to verify position columns exist
	// We use a limit 0 query to avoid data transfer
	checkSQL := `SELECT pos_x, pos_y, pos_z FROM graph_nodes LIMIT 0`
	rows, err := queries.DB().QueryContext(ctx, checkSQL)
	if err != nil {
		// Check if it's a column doesn't exist error (PostgreSQL error code 42703)
		if strings.Contains(err.Error(), "does not exist") &&
			(strings.Contains(err.Error(), "pos_x") ||
				strings.Contains(err.Error(), "pos_y") ||
				strings.Contains(err.Error(), "pos_z")) {
			return false
		}
		// Other errors are unexpected but we'll treat as "not available"
		log.Printf("⚠️ unexpected error checking position columns: %v", err)
		return false
	}
	rows.Close()
	return true
}

// computeAndStoreLayout calculates a simple force-directed 2D layout for a capped set of nodes
// and persists positions into graph_nodes.pos_x/pos_y (pos_z set to 0). It is best-effort and
// bounded to avoid heavy CPU load.
func (s *Service) computeAndStoreLayout(ctx context.Context) error {
	layoutStart := time.Now()

	// Only works with real db.Queries (not fakes/mocks)
	queries, ok := s.store.(*db.Queries)
	if !ok {
		log.Println("ℹ️ layout computation skipped: store is not *db.Queries")
		return nil
	}

	// Check if position columns exist before attempting to use them
	posColumnsExist := s.checkPositionColumnsExist(ctx, queries)
	if !posColumnsExist {
		log.Printf("ℹ️ layout computation skipped: position columns (pos_x/pos_y/pos_z) not present in graph_nodes table (run migrations to enable)")
		return nil
	}
	log.Printf("✅ position columns detected: layout computation enabled")

	// Caps and iteration counts via env to keep safe on servers
	maxNodes := 5000
	if v := os.Getenv("LAYOUT_MAX_NODES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 100 {
			maxNodes = n
		}
	}
	iterations := 400
	if v := os.Getenv("LAYOUT_ITERATIONS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 50 {
			iterations = n
		}
	}
	batchSize := 5000
	if v := os.Getenv("LAYOUT_BATCH_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 100 {
			batchSize = n
		}
	}
	epsilon := 0.0 // distance threshold for updates (0 = update all)
	if v := os.Getenv("LAYOUT_EPSILON"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 {
			epsilon = f
		}
	}

	log.Printf("⚙️ layout configuration: max_nodes=%d, iterations=%d, batch_size=%d, epsilon=%.2f", maxNodes, iterations, batchSize, epsilon)

	if maxNodes <= 0 || iterations <= 0 {
		log.Printf("ℹ️ layout computation disabled via configuration")
		return nil
	}

	// Fetch top-N nodes by weight and corresponding links subgraph
	nodes, err := queries.ListGraphNodesByWeight(ctx, int32(maxNodes))
	if err != nil {
		return fmt.Errorf("list nodes for layout: %w", err)
	}
	if len(nodes) == 0 {
		log.Printf("ℹ️ no nodes found for layout computation")
		return nil
	}
	log.Printf("📊 computing layout for %d nodes with %d iterations", len(nodes), iterations)

	ids := make([]string, len(nodes))
	for i, n := range nodes {
		ids[i] = n.ID
	}
	links, err := queries.ListGraphLinksAmong(ctx, ids)
	if err != nil {
		return fmt.Errorf("list links for layout: %w", err)
	}
	log.Printf("🔗 found %d links among selected nodes", len(links))

	// Map node index
	idx := make(map[string]int, len(nodes))
	for i, n := range nodes {
		idx[n.ID] = i
	}

	// Initialize positions in a circle to reduce initial clashes
	N := len(nodes)
	X := make([]float64, N)
	Y := make([]float64, N)
	Z := make([]float64, N)
	R := 200.0 * math.Sqrt(float64(N)/1000.0+1)
	for i := 0; i < N; i++ {
		a := 2 * math.Pi * float64(i) / float64(N)
		X[i] = R * math.Cos(a)
		Y[i] = R * math.Sin(a)
		Z[i] = 0
	}
	// Build adjacency
	type edge struct{ a, b int }
	E := make([]edge, 0, len(links))
	seen := make(map[[2]int]struct{}, len(links))
	for _, l := range links {
		ia, okA := idx[l.Source]
		ib, okB := idx[l.Target]
		if !okA || !okB || ia == ib {
			continue
		}
		key := [2]int{min(ia, ib), max(ia, ib)}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		E = append(E, edge{a: ia, b: ib})
	}
	if len(E) == 0 {
		log.Printf("⚠️ no edges found; skipping force-directed layout")
		return nil
	}
	log.Printf("🌐 initialized layout: %d nodes, %d edges, radius=%.1f", N, len(E), R)

	// Simple FR-like dynamics
	area := R * R
	k := math.Sqrt(area / float64(N))
	cool := R / float64(iterations)
	dispX := make([]float64, N)
	dispY := make([]float64, N)
	var rep = func(dist float64) float64 { return (k * k) / dist }
	var attr = func(dist float64) float64 { return (dist * dist) / k }

	layoutComputeStart := time.Now()
	for it := 0; it < iterations; it++ {
		for i := 0; i < N; i++ {
			dispX[i], dispY[i] = 0, 0
		}
		for v := 0; v < N; v++ {
			for u := v + 1; u < N; u++ {
				dx := X[v] - X[u]
				dy := Y[v] - Y[u]
				dist := math.Hypot(dx, dy)
				if dist < 1e-6 {
					dx, dy, dist = (randFloat() - 0.5), (randFloat() - 0.5), 1
				}
				force := rep(dist)
				rx := dx / dist * force
				ry := dy / dist * force
				dispX[v] += rx
				dispY[v] += ry
				dispX[u] -= rx
				dispY[u] -= ry
			}
		}
		for _, e := range E {
			dx := X[e.a] - X[e.b]
			dy := Y[e.a] - Y[e.b]
			dist := math.Hypot(dx, dy)
			if dist < 1e-6 {
				dx, dy, dist = (randFloat() - 0.5), (randFloat() - 0.5), 1
			}
			force := attr(dist)
			ax := dx / dist * force
			ay := dy / dist * force
			dispX[e.a] -= ax
			dispY[e.a] -= ay
			dispX[e.b] += ax
			dispY[e.b] += ay
		}
		// limit max displacement (temperature)
		temp := R - float64(it)*cool
		for v := 0; v < N; v++ {
			dx := dispX[v]
			dy := dispY[v]
			disp := math.Hypot(dx, dy)
			if disp > 0 {
				X[v] += dx / disp * math.Min(disp, temp)
				Y[v] += dy / disp * math.Min(disp, temp)
			}
			// prevent blow-up
			if X[v] > 1e6 {
				X[v] = 1e6
			} else if X[v] < -1e6 {
				X[v] = -1e6
			}
			if Y[v] > 1e6 {
				Y[v] = 1e6
			} else if Y[v] < -1e6 {
				Y[v] = -1e6
			}
		}
	}
	layoutComputeDuration := time.Since(layoutComputeStart)
	log.Printf("⏱️ layout computation completed in %s", layoutComputeDuration.Truncate(time.Millisecond))

	// Persist positions in batches
	updateStart := time.Now()
	updated, err := queries.BatchUpdateGraphNodePositions(ctx, ids, X, Y, Z, batchSize, epsilon)
	if err != nil {
		return fmt.Errorf("update positions: %w", err)
	}
	updateDuration := time.Since(updateStart)

	totalDuration := time.Since(layoutStart)
	log.Printf("🗺️ layout complete: %d/%d positions updated in %s (total: %s)", updated, len(ids), updateDuration.Truncate(time.Millisecond), totalDuration.Truncate(time.Millisecond))

	return nil
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// simple random float in [0,1); no global rng dependency to avoid races
func randFloat() float64 {
	// Xorshift-based tiny RNG
	var x uint64 = uint64(time.Now().UnixNano())
	x ^= x << 13
	x ^= x >> 7
	x ^= x << 17
	return float64(x%1_000_000) / 1_000_000.0
}
