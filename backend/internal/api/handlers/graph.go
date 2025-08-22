package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

// Handler handles HTTP requests for the graph API.
type GraphDataReader interface {
	// Legacy aggregated JSON (users+subreddits only)
	GetGraphData(ctx context.Context) ([]json.RawMessage, error)
	// Precalculated graph tables (graph_nodes/graph_links)
	GetPrecalculatedGraphData(ctx context.Context) ([]db.GetPrecalculatedGraphDataRow, error)
}

type Handler struct { queries GraphDataReader }

// NewHandler creates a new graph handler.
func NewHandler(q GraphDataReader) *Handler { return &Handler{queries: q} }

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

// GetGraphData returns the graph data.
// It prefers the precalculated graph tables (graph_nodes/graph_links) when available,
// and falls back to the legacy aggregated JSON if none are present.
func (h *Handler) GetGraphData(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	// Try precalculated tables first
	rows, err := h.queries.GetPrecalculatedGraphData(ctx)
	if err == nil && len(rows) > 0 {
		resp := GraphResponse{Nodes: make([]GraphNode, 0, len(rows)), Links: make([]GraphLink, 0, len(rows))}
		for _, row := range rows {
			switch strings.ToLower(row.DataType) {
			case "node":
				// row.Val is text; best-effort parse to int
				v := 0
				if row.Val != "" {
					if iv, perr := strconv.Atoi(row.Val); perr == nil {
						v = iv
					}
				}
				t := ""
				if (row.Type != sql.NullString{}) && row.Type.Valid {
					t = row.Type.String
				}
				resp.Nodes = append(resp.Nodes, GraphNode{
					ID:   row.ID,
					Name: row.Name,
					Val:  v,
					Type: t,
				})
			case "link":
				// Source/Target are TEXT in SQL but generated as interface{} here; stringify safely
				src := toString(row.Source)
				tgt := toString(row.Target)
				if src != "" && tgt != "" {
					resp.Links = append(resp.Links, GraphLink{Source: src, Target: tgt})
				}
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
		return
	}

	// Fallback to legacy aggregated JSON (users+subreddits only)
	data, err := h.queries.GetGraphData(ctx)
	if err != nil {
		http.Error(w, "Failed to fetch graph data", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if len(data) == 1 {
		w.Write(data[0])
		return
	}
	w.Write([]byte(`{"nodes":[],"links":[]}`))
}

func toString(v interface{}) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	default:
		// generated type may use []uint8 for TEXT
		if b, ok := x.([]byte); ok {
			return string(b)
		}
		return ""
	}
}