#!/bin/bash
set -e

echo "🚀 Pulling latest changes..."
git -C /home/onnwee/projects/reddit-cluster-map pull origin deploy

echo "📦 Building and restarting containers..."
docker compose -f /home/onnwee/projects/reddit-cluster-map/backend/docker-compose.yml up -d --build

echo "✅ Deployment complete."
