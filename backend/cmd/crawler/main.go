package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/onnwee/reddit-cluster-map/backend/internal/crawler"
)

func main() {
	// Initialize the crawler
	c, err := crawler.NewCrawler()
	if err != nil {
		log.Fatalf("Failed to initialize crawler: %v", err)
	}

	// Start the crawler
	if err := c.Start(); err != nil {
		log.Fatalf("Failed to start crawler: %v", err)
	}

	// Wait for a signal to stop the crawler
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	// Stop the crawler
	if err := c.Stop(); err != nil {
		log.Fatalf("Failed to stop crawler: %v", err)
	}
} 