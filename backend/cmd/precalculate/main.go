package main

import (
	"context"
	"database/sql"
	"log"
	"os"

	_ "github.com/lib/pq"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

func precalculateGraphData(dbConn *sql.DB, queries *db.Queries) error {
	ctx := context.Background()
	graphData, err := queries.GetGraphData(ctx)
	if err != nil {
		return err
	}

	// Clear existing data
	_, err = dbConn.ExecContext(ctx, "TRUNCATE graph_data")
	if err != nil {
		return err
	}

	// Insert new data
	for _, data := range graphData {
		_, err = dbConn.ExecContext(ctx, `
			INSERT INTO graph_data (data_type, node_id, node_name, node_value, node_type, source, target)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, data.DataType, data.ID, data.Name, data.Val, data.Type, data.ID, data.Name)
		if err != nil {
			return err
		}
	}

	// Update timestamp
	_, err = dbConn.ExecContext(ctx, "UPDATE graph_data SET updated_at = CURRENT_TIMESTAMP")
	return err
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL environment variable not set")
	}
	dbConn, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to initialize DB: %v", err)
	}
	defer dbConn.Close()

	queries := db.New(dbConn)

	err = precalculateGraphData(dbConn, queries)
	if err != nil {
		log.Fatalf("Failed to precalculate graph data: %v", err)
	}

	log.Println("Graph data precalculated successfully")
} 