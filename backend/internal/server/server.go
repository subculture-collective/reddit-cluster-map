package server

import (
	"database/sql"
	"os"

	_ "github.com/lib/pq"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

type Server struct {
	DB *db.Queries
}

func InitDB() (*db.Queries, error) {
	conn, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
	  return nil, err
	}
	return db.New(conn), nil
  }

func NewServer(q *db.Queries) *Server {
	return &Server{DB: q}
}
