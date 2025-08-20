package graph

import (
	"context"
	"log"
	"time"
)

type Job struct {
	service *Service
	interval time.Duration
}

func NewJob(service *Service, interval time.Duration) *Job {
	return &Job{
		service:  service,
		interval: interval,
	}
}

func (j *Job) Start(ctx context.Context) {
	ticker := time.NewTicker(j.interval)
	defer ticker.Stop()

	// Run immediately on start
	// Precalculates the entire graph (nodes + edges) and stores in DB tables used by queries.
	if err := j.service.PrecalculateGraphData(ctx); err != nil {
		log.Printf("Error precalculating graph data: %v", err)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := j.service.PrecalculateGraphData(ctx); err != nil {
				log.Printf("Error precalculating graph data: %v", err)
			}
		}
	}
} 