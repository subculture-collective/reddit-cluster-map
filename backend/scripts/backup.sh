#!/bin/bash
set -euo pipefail

# Config
PGHOST="${PGHOST:-db}"
PGUSER="${POSTGRES_USER:-postgres}"
PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"
PGDB="${POSTGRES_DB:-reddit_cluster}"

export PGPASSWORD

# Ensure target directory exists (mounted volume in compose)
mkdir -p backups

# Simple readiness check (max 5s)
if ! pg_isready -h "$PGHOST" -U "$PGUSER" -d "$PGDB" -t 5 >/dev/null 2>&1; then
	echo "Error: database not reachable at host=$PGHOST db=$PGDB user=$PGUSER" >&2
	exit 1
fi

# Timestamped filename
TS=$(date +%Y%m%d_%H%M%S)
OUT="backups/reddit_cluster_${TS}.sql"

# Run dump
pg_dump -h "$PGHOST" -U "$PGUSER" "$PGDB" > "$OUT"

# Keep only the last 7 backups
ls -t backups/reddit_cluster_*.sql 2>/dev/null | tail -n +8 | xargs -r rm --

echo "Backup completed: $OUT (size=$(stat -c%s "$OUT" 2>/dev/null || echo 0) bytes)"