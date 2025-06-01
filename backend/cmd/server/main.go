package main

import (
	"log"
	"net/http"
	"context"

	"github.com/joho/godotenv"
	"github.com/onnwee/reddit-cluster-map/backend/internal/api"
	"github.com/onnwee/reddit-cluster-map/backend/internal/server"
	"github.com/onnwee/reddit-cluster-map/backend/internal/crawler"
)

func main() {
	_ = godotenv.Load()
	ctx := context.Background()

	queries, err := server.InitDB()
	if err != nil {
		log.Fatalf("❌ DB init failed: %v", err)
	}

	go crawler.StartCrawlWorker(ctx, queries)

	router := api.NewRouter(queries)

	log.Println("🚀 Server running at http://localhost:8000")
	log.Fatal(http.ListenAndServe(":8000", router))
}
