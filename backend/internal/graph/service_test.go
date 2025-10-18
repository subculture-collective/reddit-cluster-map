package graph

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"

	"github.com/onnwee/reddit-cluster-map/backend/internal/config"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

// fakeStore implements GraphStore for testing without a real DB.
type fakeStore struct {
	// inputs tracked
	insertedNodes map[string]db.BulkInsertGraphNodeParams
	insertedLinks [][2]string
}

func newFakeStore() *fakeStore {
	return &fakeStore{insertedNodes: map[string]db.BulkInsertGraphNodeParams{}}
}

// Cleanup
func (f *fakeStore) ClearSubredditRelationships(ctx context.Context) error { return nil }
func (f *fakeStore) ClearUserSubredditActivity(ctx context.Context) error  { return nil }
func (f *fakeStore) ClearGraphTables(ctx context.Context) error            { return nil }

// Reads
func (f *fakeStore) GetAllSubreddits(ctx context.Context) ([]db.GetAllSubredditsRow, error) {
	return []db.GetAllSubredditsRow{{ID: 1, Name: "a"}, {ID: 2, Name: "b"}}, nil
}
func (f *fakeStore) GetAllUsers(ctx context.Context) ([]db.GetAllUsersRow, error) {
	return []db.GetAllUsersRow{{ID: 10, Username: "u1"}}, nil
}
func (f *fakeStore) GetAllSubredditRelationships(ctx context.Context) ([]db.GetAllSubredditRelationshipsRow, error) {
	return nil, nil
}
func (f *fakeStore) GetAllUserSubredditActivity(ctx context.Context) ([]db.GetAllUserSubredditActivityRow, error) {
	return nil, nil
}

// Overlap + activity
func (f *fakeStore) GetSubredditOverlap(ctx context.Context, arg db.GetSubredditOverlapParams) (int64, error) {
	return 0, nil
}
func (f *fakeStore) CreateSubredditRelationship(ctx context.Context, arg db.CreateSubredditRelationshipParams) (db.SubredditRelationship, error) {
	return db.SubredditRelationship{}, nil
}
func (f *fakeStore) GetUserSubreddits(ctx context.Context, authorID int32) ([]db.GetUserSubredditsRow, error) {
	return []db.GetUserSubredditsRow{{ID: 1, Name: "a"}}, nil
}
func (f *fakeStore) GetUserSubredditActivityCount(ctx context.Context, arg db.GetUserSubredditActivityCountParams) (int32, error) {
	return 1, nil
}
func (f *fakeStore) CreateUserSubredditActivity(ctx context.Context, arg db.CreateUserSubredditActivityParams) (db.UserSubredditActivity, error) {
	return db.UserSubredditActivity{}, nil
}

// Graph data
func (f *fakeStore) BulkInsertGraphNode(ctx context.Context, arg db.BulkInsertGraphNodeParams) error {
	f.insertedNodes[arg.ID] = arg
	return nil
}
func (f *fakeStore) BulkInsertGraphLink(ctx context.Context, arg db.BulkInsertGraphLinkParams) error {
	f.insertedLinks = append(f.insertedLinks, [2]string{arg.Source, arg.Target})
	return nil
}

func (f *fakeStore) ListUsersWithActivity(ctx context.Context) ([]db.ListUsersWithActivityRow, error) {
	return []db.ListUsersWithActivityRow{{ID: 10, Username: "u1", TotalActivity: 2}}, nil
}

// Detailed content
func (f *fakeStore) ListPostsBySubreddit(ctx context.Context, arg db.ListPostsBySubredditParams) ([]db.Post, error) {
	// Two posts by same author in different subs to enable cross-linking
	if arg.SubredditID == 1 {
		return []db.Post{{ID: "p1", SubredditID: 1, AuthorID: 10, Title: sql.NullString{String: "t1", Valid: true}}}, nil
	}
	return []db.Post{{ID: "p2", SubredditID: 2, AuthorID: 10, Title: sql.NullString{String: "t2", Valid: true}}}, nil
}
func (f *fakeStore) ListCommentsByPost(ctx context.Context, postID string) ([]db.Comment, error) {
	return nil, nil
}
func (f *fakeStore) GetUserTotalActivity(ctx context.Context, authorID int32) (int32, error) {
	return 2, nil
}

func TestPrecalculateGraphData_MinimalWithoutDetailed(t *testing.T) {
	os.Setenv("DETAILED_GRAPH", "false")
	t.Cleanup(func() { os.Unsetenv("DETAILED_GRAPH") })
	config.ResetForTest()
	config.Load()

	fs := newFakeStore()
	svc := NewService(fs)
	if err := svc.PrecalculateGraphData(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Expect user and subreddit nodes, but no post/comment nodes
	if _, ok := fs.insertedNodes["user_10"]; !ok {
		t.Fatalf("expected user node to be inserted")
	}
	if _, ok := fs.insertedNodes["subreddit_1"]; !ok {
		t.Fatalf("expected subreddit_1 node to be inserted")
	}
	for id := range fs.insertedNodes {
		if strings.HasPrefix(id, "post_") || strings.HasPrefix(id, "comment_") {
			t.Fatalf("did not expect content node in minimal mode: %s", id)
		}
	}
}

func TestPrecalculateGraphData_AuthorCrossLinkCap(t *testing.T) {
	os.Setenv("DETAILED_GRAPH", "true")
	os.Setenv("MAX_AUTHOR_CONTENT_LINKS", "1")
	os.Setenv("POSTS_PER_SUB_IN_GRAPH", "5")
	t.Cleanup(func() {
		os.Unsetenv("DETAILED_GRAPH")
		os.Unsetenv("MAX_AUTHOR_CONTENT_LINKS")
		os.Unsetenv("POSTS_PER_SUB_IN_GRAPH")
	})
	config.ResetForTest()
	config.Load()

	fs := newFakeStore()
	svc := NewService(fs)
	if err := svc.PrecalculateGraphData(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Ensure at least one cross-link between p1 and p2 was added due to cap=1
	cross := 0
	for _, l := range fs.insertedLinks {
		if (l[0] == "post_p1" && l[1] == "post_p2") || (l[0] == "post_p2" && l[1] == "post_p1") {
			cross++
		}
	}
	if cross == 0 {
		t.Fatalf("expected at least one author cross-link between posts")
	}
}

func TestCheckPositionColumnsExist_Fake(t *testing.T) {
	// Test with fake store (should return false gracefully, not panic)
	fs := newFakeStore()
	svc := NewService(fs)
	
	// This should not panic even though fakeStore doesn't implement db.Queries
	err := svc.computeAndStoreLayout(context.Background())
	if err != nil {
		t.Fatalf("expected no error with fake store, got: %v", err)
	}
}
