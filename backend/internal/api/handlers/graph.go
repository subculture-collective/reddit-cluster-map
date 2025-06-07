package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"log"

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
		log.Println("[GetGraphData] Endpoint hit")
		log.Println("[GetGraphData] Fetching precalculated data...")

		graphData, err := q.GetPrecalculatedGraphData(r.Context())
		if err != nil {
			log.Printf("[GetGraphData] Error fetching precalculated data: %v", err)
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
					Source: strconv.FormatInt(data.Source.Int64, 10),
					Target: strconv.FormatInt(data.Target.Int64, 10),
				})
			}
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			log.Printf("[GetGraphData] Error encoding response: %v", err)
			http.Error(w, "Failed to encode response", http.StatusInternalServerError)
			return
		}
		log.Println("[GetGraphData] Response sent successfully")
	}
} 