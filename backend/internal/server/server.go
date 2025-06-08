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
	return nil
}
