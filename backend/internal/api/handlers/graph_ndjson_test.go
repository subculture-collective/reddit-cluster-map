package handlers

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/onnwee/reddit-cluster-map/backend/internal/cache"
)

// TestGetGraphData_NDJSON tests the NDJSON streaming functionality
func TestGetGraphData_NDJSON(t *testing.T) {
	// Create mock data reader
	mockReader := &MockGraphDataReader{}
	mockCache := cache.NewMockCache()
	handler := NewHandler(mockReader, mockCache)

	// Create request with NDJSON Accept header
	req := httptest.NewRequest(http.MethodGet, "/api/graph", nil)
	req.Header.Set("Accept", "application/x-ndjson")
	rr := httptest.NewRecorder()

	// Call handler
	handler.GetGraphData(rr, req)

	// Check response
	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	// Check content type
	contentType := rr.Header().Get("Content-Type")
	if !strings.Contains(contentType, "application/x-ndjson") {
		t.Errorf("Expected Content-Type to contain 'application/x-ndjson', got '%s'", contentType)
	}

	// Parse NDJSON response
	scanner := bufio.NewScanner(rr.Body)
	nodeCount := 0
	linkCount := 0
	metaCount := 0

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var envelope NDJSONEnvelope
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			t.Fatalf("Failed to parse NDJSON line: %v, line: %s", err, line)
		}

		switch envelope.Type {
		case "node":
			nodeCount++
			// Verify node structure
			if envelope.Data == nil {
				t.Error("Node envelope has nil data")
			}
		case "link":
			linkCount++
			// Verify link structure
			if envelope.Data == nil {
				t.Error("Link envelope has nil data")
			}
		case "meta":
			metaCount++
			// Verify meta fields
			if envelope.TotalNodes == nil {
				t.Error("Meta envelope missing totalNodes")
			}
			if envelope.TotalLinks == nil {
				t.Error("Meta envelope missing totalLinks")
			}
			// Verify counts match
			if *envelope.TotalNodes != nodeCount {
				t.Errorf("Meta totalNodes (%d) doesn't match actual node count (%d)", *envelope.TotalNodes, nodeCount)
			}
			if *envelope.TotalLinks != linkCount {
				t.Errorf("Meta totalLinks (%d) doesn't match actual link count (%d)", *envelope.TotalLinks, linkCount)
			}
		default:
			t.Errorf("Unknown envelope type: %s", envelope.Type)
		}
	}

	if err := scanner.Err(); err != nil {
		t.Fatalf("Scanner error: %v", err)
	}

	// Verify we got nodes, links, and exactly one meta
	if nodeCount == 0 {
		t.Error("Expected at least some nodes")
	}
	if linkCount == 0 {
		t.Error("Expected at least some links")
	}
	if metaCount != 1 {
		t.Errorf("Expected exactly 1 meta envelope, got %d", metaCount)
	}
}

// TestGetGraphData_JSON tests backward compatibility with regular JSON
func TestGetGraphData_JSON(t *testing.T) {
	// Create mock data reader
	mockReader := &MockGraphDataReader{}
	mockCache := cache.NewMockCache()
	handler := NewHandler(mockReader, mockCache)

	// Create request WITHOUT NDJSON Accept header (default JSON)
	req := httptest.NewRequest(http.MethodGet, "/api/graph", nil)
	rr := httptest.NewRecorder()

	// Call handler
	handler.GetGraphData(rr, req)

	// Check response
	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	// Check content type
	contentType := rr.Header().Get("Content-Type")
	if !strings.Contains(contentType, "application/json") {
		t.Errorf("Expected Content-Type to contain 'application/json', got '%s'", contentType)
	}

	// Parse JSON response
	var resp GraphResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	// Verify we got data
	if len(resp.Nodes) == 0 {
		t.Error("Expected at least some nodes in JSON response")
	}
	if len(resp.Links) == 0 {
		t.Error("Expected at least some links in JSON response")
	}
}

// TestGetGraphData_NDJSONvsJSON tests that NDJSON and JSON return equivalent data
func TestGetGraphData_NDJSONvsJSON(t *testing.T) {
	// Create mock data reader with deterministic data
	mockReader := &MockGraphDataReader{}
	mockCache := cache.NewMockCache()

	// Test with NDJSON
	handlerNDJSON := NewHandler(mockReader, mockCache)
	reqNDJSON := httptest.NewRequest(http.MethodGet, "/api/graph", nil)
	reqNDJSON.Header.Set("Accept", "application/x-ndjson")
	rrNDJSON := httptest.NewRecorder()
	handlerNDJSON.GetGraphData(rrNDJSON, reqNDJSON)

	// Parse NDJSON to collect nodes and links
	var ndjsonNodes []GraphNode
	var ndjsonLinks []GraphLink
	scanner := bufio.NewScanner(rrNDJSON.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		var envelope NDJSONEnvelope
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			t.Fatalf("Failed to parse NDJSON: %v", err)
		}
		switch envelope.Type {
		case "node":
			nodeBytes, _ := json.Marshal(envelope.Data)
			var node GraphNode
			json.Unmarshal(nodeBytes, &node)
			ndjsonNodes = append(ndjsonNodes, node)
		case "link":
			linkBytes, _ := json.Marshal(envelope.Data)
			var link GraphLink
			json.Unmarshal(linkBytes, &link)
			ndjsonLinks = append(ndjsonLinks, link)
		}
	}

	// Test with regular JSON (use fresh cache)
	mockCache2 := cache.NewMockCache()
	handlerJSON := NewHandler(mockReader, mockCache2)
	reqJSON := httptest.NewRequest(http.MethodGet, "/api/graph", nil)
	rrJSON := httptest.NewRecorder()
	handlerJSON.GetGraphData(rrJSON, reqJSON)

	var jsonResp GraphResponse
	json.NewDecoder(rrJSON.Body).Decode(&jsonResp)

	// Compare counts
	if len(ndjsonNodes) != len(jsonResp.Nodes) {
		t.Errorf("NDJSON nodes count (%d) doesn't match JSON nodes count (%d)", len(ndjsonNodes), len(jsonResp.Nodes))
	}
	if len(ndjsonLinks) != len(jsonResp.Links) {
		t.Errorf("NDJSON links count (%d) doesn't match JSON links count (%d)", len(ndjsonLinks), len(jsonResp.Links))
	}
}

// BenchmarkGetGraphData_NDJSON benchmarks NDJSON streaming
func BenchmarkGetGraphData_NDJSON(b *testing.B) {
	mockReader := &MockGraphDataReader{}
	mockCache := cache.NewMockCache()
	handler := NewHandler(mockReader, mockCache)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/graph", nil)
		req.Header.Set("Accept", "application/x-ndjson")
		rr := httptest.NewRecorder()
		handler.GetGraphData(rr, req)
	}
}

// BenchmarkGetGraphData_JSON benchmarks regular JSON
func BenchmarkGetGraphData_JSON(b *testing.B) {
	mockReader := &MockGraphDataReader{}
	mockCache := cache.NewMockCache()
	handler := NewHandler(mockReader, mockCache)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/graph", nil)
		rr := httptest.NewRecorder()
		handler.GetGraphData(rr, req)
	}
}
