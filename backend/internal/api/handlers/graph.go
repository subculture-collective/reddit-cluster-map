package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

// Handler handles HTTP requests for the graph API.
type Handler struct {
	queries *db.Queries
}

// NewHandler creates a new graph handler.
func NewHandler(q *db.Queries) *Handler {
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
	json.NewEncoder(w).Encode(data)
} 