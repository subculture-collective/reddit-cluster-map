package admin

import (
	"context"
	"database/sql"
	"strings"

	"github.com/onnwee/reddit-cluster-map/backend/internal/db"
)

// ensureTable creates the service_settings table if missing.
func ensureTable(ctx context.Context, q *db.Queries) error {
    _, err := q.DB().ExecContext(ctx, `
        CREATE TABLE IF NOT EXISTS service_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )`)
    return err
}

// Get returns the value for a key or empty string if not set.
func Get(ctx context.Context, q *db.Queries, key string) (string, error) {
    if err := ensureTable(ctx, q); err != nil { return "", err }
    row := q.DB().QueryRowContext(ctx, `SELECT value FROM service_settings WHERE key=$1`, key)
    var v string
    if err := row.Scan(&v); err != nil {
        if err == sql.ErrNoRows { return "", nil }
        return "", err
    }
    return v, nil
}

// Set sets the value for a key.
func Set(ctx context.Context, q *db.Queries, key, value string) error {
    if err := ensureTable(ctx, q); err != nil { return err }
    _, err := q.DB().ExecContext(ctx, `
        INSERT INTO service_settings(key, value)
        VALUES($1,$2)
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, key, strings.TrimSpace(value))
    return err
}

// GetBool reads a boolean with default if missing.
func GetBool(ctx context.Context, q *db.Queries, key string, def bool) (bool, error) {
    v, err := Get(ctx, q, key)
    if err != nil { return def, err }
    if v == "" { return def, nil }
    switch strings.ToLower(strings.TrimSpace(v)) {
    case "1", "true", "yes", "on":
        return true, nil
    case "0", "false", "no", "off":
        return false, nil
    default:
        return def, nil
    }
}
