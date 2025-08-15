package server

import (
	"context"
	"database/sql"
	"os"
	"time"

	_ "github.com/lib/pq"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
	"github.com/onnwee/reddit-cluster-map/backend/internal/graph"
)

type Server struct {
	DB *db.Queries
	graphService *graph.Service
	graphJob *graph.Job
}

func InitDB() (*db.Queries, error) {
	conn, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		return nil, err
	}
	return db.New(conn), nil
}

func NewServer(q *db.Queries) *Server {
	graphService := graph.NewService(q)
	graphJob := graph.NewJob(graphService, 1*time.Hour) // Update every hour

	return &Server{
		DB: q,
		graphService: graphService,
		graphJob: graphJob,
	}
}

func (s *Server) Start(ctx context.Context) error {
	// Start the graph precalculation job
	go s.graphJob.Start(ctx)
	// Seed default subreddits if queue is empty
	go func() {
		// tiny delay to allow DB init
		time.Sleep(2 * time.Second)
		// Try to fetch pending jobs; if none, enqueue a few defaults
		jobs, err := s.DB.GetPendingCrawlJobs(ctx, 1)
		if err == nil && len(jobs) == 0 {
			defaults := []string{"AskReddit", "worldnews", "technology"}
			for _, name := range defaults {
				id, err := s.DB.UpsertSubreddit(ctx, db.UpsertSubredditParams{Name: name})
				if err == nil {
					_ = s.DB.EnqueueCrawlJob(ctx, db.EnqueueCrawlJobParams{SubredditID: id})
				}
			}
		}
	}()
	return nil
}
