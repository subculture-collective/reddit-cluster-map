package db

// DB exposes the underlying connection used by sqlc-generated Queries.
// It returns the DBTX interface so callers can run raw SQL when needed.
func (q *Queries) DB() DBTX {
	return q.db
}
