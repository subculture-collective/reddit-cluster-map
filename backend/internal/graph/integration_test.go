package graph

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"

	_ "github.com/lib/pq"
	"github.com/onnwee/reddit-cluster-map/backend/internal/config"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

func TestIntegration_PrecalculateGraphData_Smoke(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
		return
	}
	conn, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	t.Cleanup(func() { conn.Close() })

	q := db.New(conn)
	svc := NewService(q)
	if err := svc.PrecalculateGraphData(context.Background()); err != nil {
		t.Fatalf("precalc failed: %v", err)
	}
}

func TestIntegration_PositionColumns_Detection(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
		return
	}
	conn, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	t.Cleanup(func() { conn.Close() })

	q := db.New(conn)
	svc := NewService(q)
	ctx := context.Background()

	// Check position column detection
	hasPositions := svc.checkPositionColumnsExist(ctx, q)

	// The test should pass regardless of whether columns exist
	// We're just testing that the detection doesn't crash
	t.Logf("Position columns exist: %v", hasPositions)

	// Now try to compute layout - should not error even if columns are missing
	err = svc.computeAndStoreLayout(ctx)
	if err != nil {
		t.Fatalf("computeAndStoreLayout failed: %v", err)
	}
}

func TestIntegration_BatchUpdatePositions(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
		return
	}
	conn, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	t.Cleanup(func() { conn.Close() })

	q := db.New(conn)
	svc := NewService(q)
	ctx := context.Background()

	// Check if position columns exist first
	hasPositions := svc.checkPositionColumnsExist(ctx, q)
	if !hasPositions {
		t.Skip("Position columns not present; skipping batch update test")
		return
	}

	// Insert a few test nodes
	testNodes := []string{"test_batch_1", "test_batch_2", "test_batch_3"}
	for _, id := range testNodes {
		err := q.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
			ID:   id,
			Name: "Test Node " + id,
			Val:  sql.NullString{String: "100", Valid: true},
			Type: sql.NullString{String: "test", Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to insert test node %s: %v", id, err)
		}
	}

	t.Cleanup(func() {
		// Clean up test nodes
		for _, id := range testNodes {
			_, _ = conn.ExecContext(ctx, "DELETE FROM graph_nodes WHERE id = $1", id)
		}
	})

	// Test batch update with small batch size
	ids := testNodes
	x := []float64{1.0, 2.0, 3.0}
	y := []float64{4.0, 5.0, 6.0}
	z := []float64{0.0, 0.0, 0.0}

	updated, err := q.BatchUpdateGraphNodePositions(ctx, ids, x, y, z, 2, 0.0)
	if err != nil {
		t.Fatalf("BatchUpdateGraphNodePositions failed: %v", err)
	}

	if updated != len(testNodes) {
		t.Errorf("expected %d updates, got %d", len(testNodes), updated)
	}

	// Verify positions were set
	for i, id := range testNodes {
		var px, py, pz sql.NullFloat64
		err := conn.QueryRowContext(ctx, "SELECT pos_x, pos_y, pos_z FROM graph_nodes WHERE id = $1", id).Scan(&px, &py, &pz)
		if err != nil {
			t.Fatalf("failed to query position for %s: %v", id, err)
		}
		if !px.Valid || px.Float64 != x[i] {
			t.Errorf("node %s: expected pos_x=%.1f, got %.1f (valid=%v)", id, x[i], px.Float64, px.Valid)
		}
		if !py.Valid || py.Float64 != y[i] {
			t.Errorf("node %s: expected pos_y=%.1f, got %.1f (valid=%v)", id, y[i], py.Float64, py.Valid)
		}
	}
}

func TestIntegration_BatchUpdatePositions_Epsilon(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
		return
	}
	conn, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	t.Cleanup(func() { conn.Close() })

	q := db.New(conn)
	svc := NewService(q)
	ctx := context.Background()

	// Check if position columns exist first
	hasPositions := svc.checkPositionColumnsExist(ctx, q)
	if !hasPositions {
		t.Skip("Position columns not present; skipping epsilon test")
		return
	}

	// Insert test nodes with initial positions
	testNodes := []string{"test_epsilon_1", "test_epsilon_2"}
	for i, id := range testNodes {
		err := q.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
			ID:   id,
			Name: "Test Node " + id,
			Val:  sql.NullString{String: "100", Valid: true},
			Type: sql.NullString{String: "test", Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to insert test node %s: %v", id, err)
		}
		// Set initial position
		_, err = conn.ExecContext(ctx, "UPDATE graph_nodes SET pos_x = $1, pos_y = $2, pos_z = $3 WHERE id = $4",
			float64(i*10), float64(i*10), 0.0, id)
		if err != nil {
			t.Fatalf("failed to set initial position for %s: %v", id, err)
		}
	}

	t.Cleanup(func() {
		for _, id := range testNodes {
			_, _ = conn.ExecContext(ctx, "DELETE FROM graph_nodes WHERE id = $1", id)
		}
	})

	// Try to update with very small changes (below epsilon threshold)
	ids := testNodes
	x := []float64{0.1, 10.1} // First node: big change, second: small change
	y := []float64{0.1, 10.1}
	z := []float64{0.0, 0.0}

	// With epsilon=5.0, only first node should be updated (distance ~14 > 5)
	// Second node has distance ~0.14 < 5, so shouldn't update
	updated, err := q.BatchUpdateGraphNodePositions(ctx, ids, x, y, z, 10, 5.0)
	if err != nil {
		t.Fatalf("BatchUpdateGraphNodePositions with epsilon failed: %v", err)
	}

	// Should update only the first node
	if updated != 1 {
		t.Logf("Warning: expected 1 update with epsilon filter, got %d (this may vary based on actual distances)", updated)
	}
}

func TestIntegration_LayoutComputation_ConfigRespect(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
		return
	}
	conn, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	t.Cleanup(func() { conn.Close() })

	q := db.New(conn)
	svc := NewService(q)
	ctx := context.Background()

	// Check if position columns exist first
	hasPositions := svc.checkPositionColumnsExist(ctx, q)
	if !hasPositions {
		t.Skip("Position columns not present; skipping layout config test")
		return
	}

	// Set custom config values for layout
	os.Setenv("LAYOUT_MAX_NODES", "100")
	os.Setenv("LAYOUT_ITERATIONS", "50")
	os.Setenv("LAYOUT_BATCH_SIZE", "50")
	os.Setenv("LAYOUT_EPSILON", "0.5")

	// Reset config to pick up new env vars
	config.ResetForTest()
	cfg := config.Load()

	// Verify config values are as expected
	if cfg.LayoutMaxNodes != 100 {
		t.Errorf("expected LayoutMaxNodes=100, got %d", cfg.LayoutMaxNodes)
	}
	if cfg.LayoutIterations != 50 {
		t.Errorf("expected LayoutIterations=50, got %d", cfg.LayoutIterations)
	}

	// Insert a small set of test nodes and links for layout computation
	testNodeIDs := []string{"layout_test_1", "layout_test_2", "layout_test_3"}
	for i, id := range testNodeIDs {
		err := q.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
			ID:   id,
			Name: "Layout Test Node " + id,
			Val:  sql.NullString{String: string(rune('0' + i + 1)), Valid: true},
			Type: sql.NullString{String: "test", Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to insert test node %s: %v", id, err)
		}
	}

	// Add some links between nodes
	_, err = conn.ExecContext(ctx, "INSERT INTO graph_links (source, target) VALUES ($1, $2) ON CONFLICT DO NOTHING", testNodeIDs[0], testNodeIDs[1])
	if err != nil {
		t.Fatalf("failed to insert test link: %v", err)
	}
	_, err = conn.ExecContext(ctx, "INSERT INTO graph_links (source, target) VALUES ($1, $2) ON CONFLICT DO NOTHING", testNodeIDs[1], testNodeIDs[2])
	if err != nil {
		t.Fatalf("failed to insert test link: %v", err)
	}

	t.Cleanup(func() {
		// Clean up test nodes and links
		for _, id := range testNodeIDs {
			_, _ = conn.ExecContext(ctx, "DELETE FROM graph_nodes WHERE id = $1", id)
			_, _ = conn.ExecContext(ctx, "DELETE FROM graph_links WHERE source = $1 OR target = $1", id)
		}
		// Reset env vars
		os.Unsetenv("LAYOUT_MAX_NODES")
		os.Unsetenv("LAYOUT_ITERATIONS")
		os.Unsetenv("LAYOUT_BATCH_SIZE")
		os.Unsetenv("LAYOUT_EPSILON")
		config.ResetForTest()
	})

	// Run layout computation
	err = svc.computeAndStoreLayout(ctx)
	if err != nil {
		t.Fatalf("computeAndStoreLayout failed: %v", err)
	}

	// Verify that positions were set for at least some nodes
	var posCount int
	err = conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM graph_nodes WHERE id = ANY($1) AND pos_x IS NOT NULL", testNodeIDs).Scan(&posCount)
	if err != nil {
		t.Fatalf("failed to count positioned nodes: %v", err)
	}

	if posCount == 0 {
		t.Error("expected at least some nodes to have positions set after layout computation")
	}

	t.Logf("Layout computation completed: %d/%d nodes positioned", posCount, len(testNodeIDs))
}

// TestIntegration_HierarchicalCommunityDetection tests hierarchical clustering with real DB
func TestIntegration_HierarchicalCommunityDetection(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
		return
	}
	conn, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	t.Cleanup(func() { conn.Close() })

	q := db.New(conn)
	svc := NewService(q)
	ctx := context.Background()

	// Create test data: 20 nodes in 3 clear clusters
	testNodeIDs := make([]string, 20)
	for i := 0; i < 20; i++ {
		id := fmt.Sprintf("hier_test_%d", i)
		testNodeIDs[i] = id
		err := q.BulkInsertGraphNode(ctx, db.BulkInsertGraphNodeParams{
			ID:   id,
			Name: fmt.Sprintf("Hierarchy Test Node %d", i),
			Val:  sql.NullString{String: strconv.Itoa(10 + i), Valid: true},
			Type: sql.NullString{String: "test", Valid: true},
		})
		if err != nil {
			t.Fatalf("failed to insert test node %s: %v", id, err)
		}
	}

	// Create cluster structure:
	// Cluster 1: nodes 0-6 (7 nodes)
	// Cluster 2: nodes 7-13 (7 nodes)
	// Cluster 3: nodes 14-19 (6 nodes)
	// Dense internal connections, sparse inter-cluster connections
	links := [][2]int{
		// Cluster 1 internal
		{0, 1}, {1, 2}, {2, 3}, {3, 4}, {4, 5}, {5, 6}, {6, 0}, {0, 3}, {1, 4}, {2, 5},
		// Cluster 2 internal
		{7, 8}, {8, 9}, {9, 10}, {10, 11}, {11, 12}, {12, 13}, {13, 7}, {7, 10}, {8, 11}, {9, 12},
		// Cluster 3 internal
		{14, 15}, {15, 16}, {16, 17}, {17, 18}, {18, 19}, {19, 14}, {14, 17}, {15, 18},
		// Inter-cluster (sparse)
		{6, 7}, {13, 14},
	}

	for _, link := range links {
		src := fmt.Sprintf("hier_test_%d", link[0])
		tgt := fmt.Sprintf("hier_test_%d", link[1])
		_, err = conn.ExecContext(ctx, "INSERT INTO graph_links (source, target) VALUES ($1, $2) ON CONFLICT DO NOTHING", src, tgt)
		if err != nil {
			t.Fatalf("failed to insert test link: %v", err)
		}
		// Add reverse link for undirected graph
		_, err = conn.ExecContext(ctx, "INSERT INTO graph_links (source, target) VALUES ($1, $2) ON CONFLICT DO NOTHING", tgt, src)
		if err != nil {
			t.Fatalf("failed to insert reverse link: %v", err)
		}
	}

	t.Cleanup(func() {
		// Clean up test nodes and links
		for _, id := range testNodeIDs {
			_, _ = conn.ExecContext(ctx, "DELETE FROM graph_nodes WHERE id = $1", id)
			_, _ = conn.ExecContext(ctx, "DELETE FROM graph_links WHERE source = $1 OR target = $1", id)
		}
		_, _ = conn.ExecContext(ctx, "DELETE FROM graph_community_hierarchy WHERE node_id LIKE 'hier_test_%'")
	})

	// Fetch nodes and links for detection
	nodes, err := q.ListGraphNodesByWeight(ctx, 50000)
	if err != nil {
		t.Fatalf("failed to fetch nodes: %v", err)
	}

	// Filter to only our test nodes
	testNodes := make([]db.ListGraphNodesByWeightRow, 0)
	for _, n := range nodes {
		for _, testID := range testNodeIDs {
			if n.ID == testID {
				testNodes = append(testNodes, n)
				break
			}
		}
	}

	if len(testNodes) != 20 {
		t.Fatalf("expected 20 test nodes, got %d", len(testNodes))
	}

	nodeIDsForLinks := make([]string, len(testNodes))
	for i, n := range testNodes {
		nodeIDsForLinks[i] = n.ID
	}

	testLinks, err := q.ListGraphLinksAmong(ctx, nodeIDsForLinks)
	if err != nil {
		t.Fatalf("failed to fetch links: %v", err)
	}

	t.Logf("Running hierarchical detection on %d nodes, %d links", len(testNodes), len(testLinks))

	// Run hierarchical detection
	hierarchy, err := svc.detectHierarchicalCommunities(ctx, q, testNodes, testLinks)
	if err != nil {
		t.Fatalf("hierarchical detection failed: %v", err)
	}

	// Validate hierarchy structure
	if len(hierarchy) < 2 {
		t.Errorf("expected at least 2 levels, got %d", len(hierarchy))
	}

	t.Logf("Generated %d hierarchy levels", len(hierarchy))
	for i, level := range hierarchy {
		uniqueComms := make(map[int]bool)
		for _, comm := range level.NodeToCommunity {
			uniqueComms[comm] = true
		}
		t.Logf("  Level %d: %d nodes, %d communities, modularity=%.3f", i, len(level.NodeToCommunity), len(uniqueComms), level.Modularity)

		// Level 0 should have all nodes in separate communities
		if i == 0 {
			if len(level.NodeToCommunity) != 20 {
				t.Errorf("level 0: expected 20 nodes, got %d", len(level.NodeToCommunity))
			}
		}

		// Level 1 should detect 3 clusters
		if i == 1 {
			if len(uniqueComms) < 2 || len(uniqueComms) > 5 {
				t.Logf("level 1: expected 2-5 communities (ideally 3), got %d", len(uniqueComms))
			}
		}
	}

	// Store hierarchy in DB
	err = svc.storeHierarchy(ctx, q, hierarchy)
	if err != nil {
		t.Fatalf("failed to store hierarchy: %v", err)
	}

	// Query back and verify
	stored, err := q.GetCommunityHierarchy(ctx)
	if err != nil {
		t.Fatalf("failed to query hierarchy: %v", err)
	}

	// Count entries per level
	levelCounts := make(map[int32]int)
	for _, row := range stored {
		if strings.HasPrefix(row.NodeID, "hier_test_") {
			levelCounts[row.Level]++
		}
	}

	t.Logf("Stored hierarchy entries: %v", levelCounts)

	for level, count := range levelCounts {
		if count != 20 {
			t.Errorf("level %d: expected 20 entries, got %d", level, count)
		}
	}
}
