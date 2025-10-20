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

// TestCacheKey verifies cache key generation includes all required parameters
func TestCacheKey(t *testing.T) {
	tests := []struct {
		name          string
		maxNodes      int
		maxLinks      int
		typeKey       string
		withPositions bool
		expected      string
	}{
		{
			name:          "basic key without positions",
			maxNodes:      100,
			maxLinks:      200,
			typeKey:       "user",
			withPositions: false,
			expected:      "100:200:user",
		},
		{
			name:          "basic key with positions",
			maxNodes:      100,
			maxLinks:      200,
			typeKey:       "user",
			withPositions: true,
			expected:      "100:200:user:pos",
		},
		{
			name:          "empty typeKey defaults to all",
			maxNodes:      500,
			maxLinks:      1000,
			typeKey:       "",
			withPositions: false,
			expected:      "500:1000:all",
		},
		{
			name:          "empty typeKey with positions",
			maxNodes:      500,
			maxLinks:      1000,
			typeKey:       "",
			withPositions: true,
			expected:      "500:1000:all:pos",
		},
		{
			name:          "multiple types",
			maxNodes:      1000,
			maxLinks:      5000,
			typeKey:       "user,subreddit",
			withPositions: false,
			expected:      "1000:5000:user,subreddit",
		},
		{
			name:          "multiple types with positions",
			maxNodes:      1000,
			maxLinks:      5000,
			typeKey:       "user,subreddit",
			withPositions: true,
			expected:      "1000:5000:user,subreddit:pos",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := cacheKey(tt.maxNodes, tt.maxLinks, tt.typeKey, tt.withPositions)
			if got != tt.expected {
				t.Errorf("cacheKey() = %q, want %q", got, tt.expected)
			}
		})
	}
}

// TestGraphHandler_CacheKeyIsolation verifies that different query parameters
// use separate cache entries and don't interfere with each other
func TestGraphHandler_CacheKeyIsolation(t *testing.T) {
	// Clear cache before test
	graphCacheMu.Lock()
	graphCache = make(map[string]graphCacheEntry)
	graphCacheMu.Unlock()

	h := &Handler{queries: &fakeGraphQueriesWithPositions{}}

	// Request 1: with_positions=true
	rr1 := httptest.NewRecorder()
	req1 := httptest.NewRequest(http.MethodGet, "/graph?with_positions=true", nil)
	h.GetGraphData(rr1, req1)

	if rr1.Code != http.StatusOK {
		t.Fatalf("request 1: expected 200, got %d", rr1.Code)
	}

	var resp1 struct {
		Nodes []struct {
			ID string   `json:"id"`
			X  *float64 `json:"x,omitempty"`
			Y  *float64 `json:"y,omitempty"`
			Z  *float64 `json:"z,omitempty"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal(rr1.Body.Bytes(), &resp1); err != nil {
		t.Fatalf("request 1 decode: %v", err)
	}

	// Request 2: without with_positions (should be separate cache entry)
	rr2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/graph", nil)
	h.GetGraphData(rr2, req2)

	if rr2.Code != http.StatusOK {
		t.Fatalf("request 2: expected 200, got %d", rr2.Code)
	}

	var resp2 struct {
		Nodes []struct {
			ID string   `json:"id"`
			X  *float64 `json:"x,omitempty"`
			Y  *float64 `json:"y,omitempty"`
			Z  *float64 `json:"z,omitempty"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal(rr2.Body.Bytes(), &resp2); err != nil {
		t.Fatalf("request 2 decode: %v", err)
	}

	// Verify both responses are different
	if len(resp1.Nodes) < 1 || len(resp2.Nodes) < 1 {
		t.Fatal("expected nodes in both responses")
	}

	// Response 1 should have positions
	if resp1.Nodes[0].X == nil || resp1.Nodes[0].Y == nil || resp1.Nodes[0].Z == nil {
		t.Error("request 1 (with_positions=true) should include position coordinates")
	}

	// Response 2 should NOT have positions
	if resp2.Nodes[0].X != nil || resp2.Nodes[0].Y != nil || resp2.Nodes[0].Z != nil {
		t.Error("request 2 (without with_positions) should not include position coordinates")
	}

	// Verify we have two separate cache entries
	graphCacheMu.Lock()
	cacheSize := len(graphCache)
	graphCacheMu.Unlock()

	if cacheSize != 2 {
		t.Errorf("expected 2 cache entries (one with positions, one without), got %d", cacheSize)
	}
}

// TestGraphHandler_CacheBehavior verifies cache hit/miss scenarios
func TestGraphHandler_CacheBehavior(t *testing.T) {
	// Clear cache before test
	graphCacheMu.Lock()
	graphCache = make(map[string]graphCacheEntry)
	graphCacheMu.Unlock()

	h := &Handler{queries: &fakeGraphQueriesWithPositions{}}

	// First request - cache miss
	rr1 := httptest.NewRecorder()
	req1 := httptest.NewRequest(http.MethodGet, "/graph?max_nodes=100&max_links=200", nil)
	h.GetGraphData(rr1, req1)

	if rr1.Code != http.StatusOK {
		t.Fatalf("request 1: expected 200, got %d", rr1.Code)
	}
	response1 := rr1.Body.String()

	// Second request with same parameters - should be cache hit
	rr2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/graph?max_nodes=100&max_links=200", nil)
	h.GetGraphData(rr2, req2)

	if rr2.Code != http.StatusOK {
		t.Fatalf("request 2: expected 200, got %d", rr2.Code)
	}
	response2 := rr2.Body.String()

	// Responses should be identical
	if response1 != response2 {
		t.Error("cached response should be identical to original response")
	}

	// Third request with different parameters - cache miss
	rr3 := httptest.NewRecorder()
	req3 := httptest.NewRequest(http.MethodGet, "/graph?max_nodes=200&max_links=400", nil)
	h.GetGraphData(rr3, req3)

	if rr3.Code != http.StatusOK {
		t.Fatalf("request 3: expected 200, got %d", rr3.Code)
	}

	// Verify we now have 2 cache entries
	graphCacheMu.Lock()
	cacheSize := len(graphCache)
	graphCacheMu.Unlock()

	if cacheSize != 2 {
		t.Errorf("expected 2 cache entries for different parameters, got %d", cacheSize)
	}
}

// TestGraphHandler_CacheKeyWithTypes verifies type filtering in cache keys
func TestGraphHandler_CacheKeyWithTypes(t *testing.T) {
	// Clear cache before test
	graphCacheMu.Lock()
	graphCache = make(map[string]graphCacheEntry)
	graphCacheMu.Unlock()

	h := &Handler{queries: &fakeGraphQueriesWithPositions{}}

	// Request 1: no type filter
	rr1 := httptest.NewRecorder()
	req1 := httptest.NewRequest(http.MethodGet, "/graph", nil)
	h.GetGraphData(rr1, req1)

	if rr1.Code != http.StatusOK {
		t.Fatalf("request 1: expected 200, got %d", rr1.Code)
	}

	// Request 2: with type filter
	rr2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/graph?types=user", nil)
	h.GetGraphData(rr2, req2)

	if rr2.Code != http.StatusOK {
		t.Fatalf("request 2: expected 200, got %d", rr2.Code)
	}

	// Request 3: with different type filter
	rr3 := httptest.NewRecorder()
	req3 := httptest.NewRequest(http.MethodGet, "/graph?types=subreddit", nil)
	h.GetGraphData(rr3, req3)

	if rr3.Code != http.StatusOK {
		t.Fatalf("request 3: expected 200, got %d", rr3.Code)
	}

	// Verify we have 3 separate cache entries
	graphCacheMu.Lock()
	cacheSize := len(graphCache)
	graphCacheMu.Unlock()

	if cacheSize != 3 {
		t.Errorf("expected 3 cache entries for different type filters, got %d", cacheSize)
	}
}
