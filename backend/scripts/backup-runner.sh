#!/bin/sh
set -euo pipefail

# Interval can be duration understood by sleep (e.g., 6h, 1d) or seconds. Default: 24h
INTERVAL="${BACKUP_INTERVAL:-24h}"

echo "[backup-runner] Starting with interval=${INTERVAL}"
while true; do
  echo "[backup-runner] Running backup at $(date -u +%F_%T)"
  if /app/scripts/backup.sh; then
    echo "[backup-runner] Backup completed"
  else
    echo "[backup-runner] Backup failed" >&2
  fi
  echo "[backup-runner] Sleeping ${INTERVAL}"
  sleep "${INTERVAL}"
done
