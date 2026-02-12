package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

// mockVersionReader implements VersionReader for testing
type mockVersionReader struct {
	currentVersion db.GraphVersion
	diffs          []db.GetGraphDiffsSinceVersionRow
}

func (m *mockVersionReader) GetCurrentGraphVersion(ctx context.Context) (db.GraphVersion, error) {
	if m.currentVersion.ID == 0 {
		return db.GraphVersion{}, sql.ErrNoRows
	}
	return m.currentVersion, nil
}

func (m *mockVersionReader) GetGraphDiffsSinceVersion(ctx context.Context, sinceVersion int64) ([]db.GetGraphDiffsSinceVersionRow, error) {
	return m.diffs, nil
}

func (m *mockVersionReader) GetGraphVersion(ctx context.Context, id int64) (db.GraphVersion, error) {
	if m.currentVersion.ID == id {
		return m.currentVersion, nil
	}
	return db.GraphVersion{}, sql.ErrNoRows
}

func (m *mockVersionReader) ListGraphVersions(ctx context.Context, arg db.ListGraphVersionsParams) ([]db.GraphVersion, error) {
	return []db.GraphVersion{m.currentVersion}, nil
}

func TestWebSocketHandler_HandleWebSocket(t *testing.T) {
	// Create mock version reader
	mockReader := &mockVersionReader{
		currentVersion: db.GraphVersion{
			ID:        1,
			NodeCount: 100,
			LinkCount: 200,
			Status:    "complete",
			CreatedAt: time.Now(),
		},
	}

	// Create handler
	handler := NewWebSocketHandler(mockReader)

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(handler.HandleWebSocket))
	defer server.Close()

	// Convert http:// to ws://
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// Connect to WebSocket
	ws, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket: %v", err)
	}
	defer ws.Close()

	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("Expected status %d, got %d", http.StatusSwitchingProtocols, resp.StatusCode)
	}

	// Read initial version message
	ws.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, message, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("Failed to read message: %v", err)
	}

	var wsMsg WebSocketMessage
	if err := json.Unmarshal(message, &wsMsg); err != nil {
		t.Fatalf("Failed to unmarshal message: %v", err)
	}

	if wsMsg.Type != "version" {
		t.Errorf("Expected message type 'version', got %s", wsMsg.Type)
	}

	// Verify payload contains version info
	payload, ok := wsMsg.Payload.(map[string]interface{})
	if !ok {
		t.Fatalf("Payload is not a map")
	}

	if versionID, ok := payload["version_id"].(float64); !ok || int64(versionID) != 1 {
		t.Errorf("Expected version_id 1, got %v", payload["version_id"])
	}

	t.Log("WebSocket connection and initial version message test passed")
}

func TestGraphDiffMessage_Structure(t *testing.T) {
	// Test that GraphDiffMessage can be properly serialized
	diff := GraphDiffMessage{
		Action: "add",
		Nodes: []GraphNode{
			{ID: "node1", Name: "Node 1", Val: 10},
		},
		Links: []GraphLink{
			{Source: "node1", Target: "node2"},
		},
		VersionID: 2,
	}

	// Serialize to JSON
	data, err := json.Marshal(diff)
	if err != nil {
		t.Fatalf("Failed to marshal diff: %v", err)
	}

	// Deserialize back
	var decoded GraphDiffMessage
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Failed to unmarshal diff: %v", err)
	}

	// Verify fields
	if decoded.Action != "add" {
		t.Errorf("Expected action 'add', got %s", decoded.Action)
	}
	if decoded.VersionID != 2 {
		t.Errorf("Expected version_id 2, got %d", decoded.VersionID)
	}
	if len(decoded.Nodes) != 1 {
		t.Errorf("Expected 1 node, got %d", len(decoded.Nodes))
	}
	if len(decoded.Links) != 1 {
		t.Errorf("Expected 1 link, got %d", len(decoded.Links))
	}

	t.Log("GraphDiffMessage structure test passed")
}
