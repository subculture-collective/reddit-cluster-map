#!/bin/bash

# Create backups directory if it doesn't exist
mkdir -p backups

# Get current timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Backup the database using pg_dump directly
PGPASSWORD=$POSTGRES_PASSWORD pg_dump -h db -U $POSTGRES_USER $POSTGRES_DB > "backups/reddit_cluster_${TIMESTAMP}.sql"

# Keep only the last 7 backups
ls -t backups/reddit_cluster_*.sql | tail -n +8 | xargs -r rm

echo "Backup completed: backups/reddit_cluster_${TIMESTAMP}.sql" 