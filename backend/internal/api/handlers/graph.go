package handlers

import (
	"context"
	"encoding/json"
	"net/http"
)

// Handler handles HTTP requests for the graph API.
type GraphDataReader interface { GetGraphData(ctx context.Context) ([]json.RawMessage, error) }
type Handler struct { queries GraphDataReader }

// NewHandler creates a new graph handler.
func NewHandler(q GraphDataReader) *Handler {
	return &Handler{queries: q}
}

type GraphNode struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Val  int    `json:"val"`
	Type string `json:"type,omitempty"`
}

type GraphLink struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

type GraphResponse struct {
	Nodes []GraphNode `json:"nodes"`
	Links []GraphLink `json:"links"`
}

// GetGraphData returns the precalculated graph data.
func (h *Handler) GetGraphData(w http.ResponseWriter, r *http.Request) {
	data, err := h.queries.GetGraphData(r.Context())
	if err != nil {
		http.Error(w, "Failed to fetch graph data", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	// The query returns a single row JSON object; unwrap the slice if present
	if len(data) == 1 {
		w.Write(data[0])
		return
	}
	// Fallback: return empty structure
	w.Write([]byte(`{"nodes":[],"links":[]}`))
} 