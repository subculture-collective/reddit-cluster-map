package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

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

func GetGraphData(q *db.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		graphData, err := q.GetGraphData(r.Context())
		if err != nil {
			http.Error(w, "Failed to fetch graph data", http.StatusInternalServerError)
			return
		}

		response := GraphResponse{
			Nodes: make([]GraphNode, 0),
			Links: make([]GraphLink, 0),
		}

		for _, data := range graphData {
			if data.DataType == "node" {
				response.Nodes = append(response.Nodes, GraphNode{
					ID:   strconv.FormatInt(data.ID, 10),
					Name: data.Name.String,
					Val:  int(data.Val.Int32),
					Type: data.Type,
				})
			} else if data.DataType == "link" {
				response.Links = append(response.Links, GraphLink{
					Source: strconv.FormatInt(data.ID, 10),
					Target: data.Name.String,
				})
			}
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			http.Error(w, "Failed to encode response", http.StatusInternalServerError)
			return
		}
	}
} 