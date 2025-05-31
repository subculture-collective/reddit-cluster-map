package main

import (
	"log"
	"net/http"
	"os"

	"github.com/joho/godotenv"

	"github.com/onnwee/subnet/internal/api"
	"github.com/onnwee/subnet/internal/db"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Println("⚠️  No .env file found (falling back to system env)")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL not set")
	}

	queries, err := db.Init(dbURL)
	if err != nil {
		log.Fatalf("DB init failed: %v", err)
	}

	router := api.NewRouter(queries)

	log.Println("🚀 Server running at http://localhost:8000")
	log.Fatal(http.ListenAndServe(":8000", router))
}
