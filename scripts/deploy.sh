#!/bin/bash

set -euo pipefail

# Optional: Log output
LOGFILE="/home/onnwee/projects/reddit-cluster-map/deploy.log"
exec >> "$LOGFILE" 2>&1
echo "---- Deploy started at $(date) ----"

cd /home/onnwee/projects/reddit-cluster-map

# Pull latest changes
echo "Pulling latest changes..."
git pull origin main

# Rebuild and restart the container
echo "Rebuilding Docker container..."
docker compose -f /home/onnwee/projects/caddy/docker-compose.yml build reddit-cluster-map
docker compose -f /home/onnwee/projects/caddy/docker-compose.yml up -d reddit-cluster-map

echo "---- Deploy finished at $(date) ----"
