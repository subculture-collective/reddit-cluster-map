package db

import (
	"database/sql"

	_ "github.com/lib/pq"
	"github.com/onnwee/reddit-backend/internal/db/gen"
)

type Queries = gen.Queries

func Init(connStr string) (*gen.Queries, error) {
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	return gen.New(db), nil
}
