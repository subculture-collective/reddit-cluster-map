package main

import (
	"context"
	"database/sql"
	"log"
	"os"

	_ "github.com/lib/pq"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
	"github.com/onnwee/reddit-cluster-map/backend/internal/graph"
)

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
	graphService := graph.NewService(queries)

	ctx := context.Background()
	if err := graphService.PrecalculateGraphData(ctx); err != nil {
		log.Fatalf("Failed to precalculate graph data: %v", err)
	}

	log.Println("Graph data precalculated successfully")
} 