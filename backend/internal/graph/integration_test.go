package graph

import (
	"context"
	"database/sql"
	"os"
	"testing"

	_ "github.com/lib/pq"
	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

func TestIntegration_PrecalculateGraphData_Smoke(t *testing.T) {
    dsn := os.Getenv("TEST_DATABASE_URL")
    if dsn == "" {
        t.Skip("TEST_DATABASE_URL not set; skipping integration test")
        return
    }
    conn, err := sql.Open("postgres", dsn)
    if err != nil {
        t.Fatalf("failed to open db: %v", err)
    }
    t.Cleanup(func() { conn.Close() })

    q := db.New(conn)
    svc := NewService(q)
    if err := svc.PrecalculateGraphData(context.Background()); err != nil {
        t.Fatalf("precalc failed: %v", err)
    }
}
