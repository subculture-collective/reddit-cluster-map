package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

// queriesAdapter wraps a fake and exposes db.Queries-like methods used in handlers.
type queriesAdapter struct{ f *fakeMemory }

type fakeMemory struct {
	subs []db.Subreddit
	jobs []db.EnqueueCrawlJobParams
}

func (qa *queriesAdapter) ListSubreddits(ctx context.Context, p db.ListSubredditsParams) ([]db.Subreddit, error) {
	start := int(p.Offset)
	end := start + int(p.Limit)
	if start > len(qa.f.subs) {
		return []db.Subreddit{}, nil
	}
	if end > len(qa.f.subs) {
		end = len(qa.f.subs)
	}
	return qa.f.subs[start:end], nil
}
func (qa *queriesAdapter) UpsertSubreddit(ctx context.Context, p db.UpsertSubredditParams) (int32, error) {
	return 1, nil
}
func (qa *queriesAdapter) CrawlJobExists(ctx context.Context, subredditID int32) (bool, error) {
	return false, nil
}
func (qa *queriesAdapter) EnqueueCrawlJob(ctx context.Context, p db.EnqueueCrawlJobParams) error {
	qa.f.jobs = append(qa.f.jobs, p)
	return nil
}

func TestGetSubreddits_Pagination(t *testing.T) {
	qa := &queriesAdapter{f: &fakeMemory{subs: []db.Subreddit{{ID: 1, Name: "a"}, {ID: 2, Name: "b"}, {ID: 3, Name: "c"}}}}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/subreddits?limit=2&offset=1", nil)
	GetSubreddits(qa)(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var out []db.Subreddit
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out) != 2 || out[0].Name != "b" || out[1].Name != "c" {
		t.Fatalf("unexpected page: %+v", out)
	}
}

func TestPostCrawl_EnqueuesJob(t *testing.T) {
	qa := &queriesAdapter{f: &fakeMemory{}}
	rr := httptest.NewRecorder()
	body := bytes.NewBufferString(`{"subreddit":"golang"}`)
	req := httptest.NewRequest(http.MethodPost, "/crawl", body)
	req.Header.Set("Content-Type", "application/json")
	PostCrawl(qa)(rr, req)
	if rr.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", rr.Code)
	}
	if len(qa.f.jobs) != 1 {
		t.Fatalf("expected 1 job enqueued, got %d", len(qa.f.jobs))
	}
}

type fakeGraphQueries struct{ data [][]byte }

func (f *fakeGraphQueries) GetGraphData(ctx context.Context) ([]json.RawMessage, error) {
	var out []json.RawMessage
	for _, b := range f.data {
		out = append(out, json.RawMessage(b))
	}
	return out, nil
}

// Satisfy new interface: always return nil to trigger fallback
func (f *fakeGraphQueries) GetPrecalculatedGraphDataCappedAll(ctx context.Context, arg db.GetPrecalculatedGraphDataCappedAllParams) ([]db.GetPrecalculatedGraphDataCappedAllRow, error) {
	return nil, nil
}
func (f *fakeGraphQueries) GetPrecalculatedGraphDataCappedFiltered(ctx context.Context, arg db.GetPrecalculatedGraphDataCappedFilteredParams) ([]db.GetPrecalculatedGraphDataCappedFilteredRow, error) {
	return nil, nil
}
func (f *fakeGraphQueries) GetPrecalculatedGraphDataNoPos(ctx context.Context) ([]db.GetPrecalculatedGraphDataNoPosRow, error) {
	return nil, nil
}

func TestGraphHandler_UnwrapsSingleRow(t *testing.T) {
	h := &Handler{queries: (&fakeGraphQueries{data: [][]byte{[]byte(`{"nodes":[{"id":"x"}],"links":[]}`)}})}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/graph", nil)
	h.GetGraphData(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	// After handler re-encodes to apply caps, allow value/default differences but same IDs
	var out struct {
		Nodes []struct {
			ID string `json:"id"`
		} `json:"nodes"`
		Links []any `json:"links"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Nodes) != 1 || out.Nodes[0].ID != "x" {
		t.Fatalf("unexpected body: %s", rr.Body.String())
	}
}

// fakeTimeoutQueries simulates a query that times out
type fakeTimeoutQueries struct{}

func (f *fakeTimeoutQueries) GetGraphData(ctx context.Context) ([]json.RawMessage, error) {
	// Also timeout on legacy fallback
	return nil, context.DeadlineExceeded
}

func (f *fakeTimeoutQueries) GetPrecalculatedGraphDataCappedAll(ctx context.Context, arg db.GetPrecalculatedGraphDataCappedAllParams) ([]db.GetPrecalculatedGraphDataCappedAllRow, error) {
	// Simulate a timeout
	return nil, context.DeadlineExceeded
}

func (f *fakeTimeoutQueries) GetPrecalculatedGraphDataCappedFiltered(ctx context.Context, arg db.GetPrecalculatedGraphDataCappedFilteredParams) ([]db.GetPrecalculatedGraphDataCappedFilteredRow, error) {
	return nil, context.DeadlineExceeded
}

func (f *fakeTimeoutQueries) GetPrecalculatedGraphDataNoPos(ctx context.Context) ([]db.GetPrecalculatedGraphDataNoPosRow, error) {
	return nil, context.DeadlineExceeded
}

func TestGraphHandler_TimeoutHandling(t *testing.T) {
	// Clear the cache to avoid interference from other tests
	graphCacheMu.Lock()
	graphCache = make(map[string]graphCacheEntry)
	graphCacheMu.Unlock()

	h := &Handler{queries: &fakeTimeoutQueries{}}
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/graph", nil)
	h.GetGraphData(rr, req)
	if rr.Code != http.StatusRequestTimeout {
		t.Fatalf("expected 408, got %d, body: %s", rr.Code, rr.Body.String())
	}
	body := rr.Body.String()
	if body == "" || (!contains(body, "timeout") && !contains(body, "Timeout")) {
		t.Fatalf("expected timeout error message, got: %s", body)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) && findSubstr(s, substr))
}

func findSubstr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// fakeGraphQueriesWithPositions simulates graph data with position columns
type fakeGraphQueriesWithPositions struct{}

func (f *fakeGraphQueriesWithPositions) GetGraphData(ctx context.Context) ([]json.RawMessage, error) {
	return nil, nil
}

func (f *fakeGraphQueriesWithPositions) GetPrecalculatedGraphDataCappedAll(ctx context.Context, arg db.GetPrecalculatedGraphDataCappedAllParams) ([]db.GetPrecalculatedGraphDataCappedAllRow, error) {
	// Return sample data with positions
	return []db.GetPrecalculatedGraphDataCappedAllRow{
		{
			DataType: "node",
			ID:       "test_node_1",
			Name:     "Test Node 1",
			Val:      "100",
			Type:     sql.NullString{String: "user", Valid: true},
			PosX:     sql.NullFloat64{Float64: 1.5, Valid: true},
			PosY:     sql.NullFloat64{Float64: 2.5, Valid: true},
			PosZ:     sql.NullFloat64{Float64: 3.5, Valid: true},
		},
		{
			DataType: "link",
			ID:       "1",
			Source:   "test_node_1",
			Target:   "test_node_2",
		},
	}, nil
}

func (f *fakeGraphQueriesWithPositions) GetPrecalculatedGraphDataCappedFiltered(ctx context.Context, arg db.GetPrecalculatedGraphDataCappedFilteredParams) ([]db.GetPrecalculatedGraphDataCappedFilteredRow, error) {
	return nil, nil
}

func (f *fakeGraphQueriesWithPositions) GetPrecalculatedGraphDataNoPos(ctx context.Context) ([]db.GetPrecalculatedGraphDataNoPosRow, error) {
	return nil, nil
}

func TestGraphHandler_WithPositions(t *testing.T) {
	// Clear cache before test
	graphCacheMu.Lock()
	graphCache = make(map[string]graphCacheEntry)
	graphCacheMu.Unlock()

	h := &Handler{queries: &fakeGraphQueriesWithPositions{}}

	// Test with with_positions=true
	t.Run("with_positions=true", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/graph?with_positions=true", nil)
		h.GetGraphData(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rr.Code)
		}

		var out struct {
			Nodes []struct {
				ID   string   `json:"id"`
				Name string   `json:"name"`
				X    *float64 `json:"x,omitempty"`
				Y    *float64 `json:"y,omitempty"`
				Z    *float64 `json:"z,omitempty"`
			} `json:"nodes"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
			t.Fatalf("decode: %v", err)
		}

		if len(out.Nodes) != 1 {
			t.Fatalf("expected 1 node, got %d", len(out.Nodes))
		}

		node := out.Nodes[0]
		if node.X == nil || node.Y == nil || node.Z == nil {
			t.Errorf("expected position coordinates, got x=%v, y=%v, z=%v", node.X, node.Y, node.Z)
		}
		if node.X != nil && *node.X != 1.5 {
			t.Errorf("expected x=1.5, got %f", *node.X)
		}
		if node.Y != nil && *node.Y != 2.5 {
			t.Errorf("expected y=2.5, got %f", *node.Y)
		}
		if node.Z != nil && *node.Z != 3.5 {
			t.Errorf("expected z=3.5, got %f", *node.Z)
		}
	})

	// Test without with_positions parameter (should not include positions)
	t.Run("without_positions", func(t *testing.T) {
		// Clear cache
		graphCacheMu.Lock()
		graphCache = make(map[string]graphCacheEntry)
		graphCacheMu.Unlock()

		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/graph", nil)
		h.GetGraphData(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rr.Code)
		}

		var out struct {
			Nodes []struct {
				ID   string   `json:"id"`
				Name string   `json:"name"`
				X    *float64 `json:"x,omitempty"`
				Y    *float64 `json:"y,omitempty"`
				Z    *float64 `json:"z,omitempty"`
			} `json:"nodes"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
			t.Fatalf("decode: %v", err)
		}

		if len(out.Nodes) != 1 {
			t.Fatalf("expected 1 node, got %d", len(out.Nodes))
		}

		node := out.Nodes[0]
		// When with_positions is not set, positions should be omitted
		if node.X != nil || node.Y != nil || node.Z != nil {
			t.Errorf("expected no position coordinates, got x=%v, y=%v, z=%v", node.X, node.Y, node.Z)
		}
	})
}
