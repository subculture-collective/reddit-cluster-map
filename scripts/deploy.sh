#!/bin/bash
set -e

echo "🚀 Pulling latest changes..."
git -C /home/onnwee/projects/reddit-cluster-map pull origin deploy

echo "📦 Building and restarting containers..."
cd /home/onnwee/projects/reddit-cluster-map/backend

# Run database migrations
echo "🔄 Running database migrations..."
docker compose exec -T db psql -U postgres -d reddit_cluster -f /docker-entrypoint-initdb.d/migrations/schema.sql

# Build and restart services
echo "🏗️ Building and restarting services..."
docker compose up -d --build

# Start the crawler service
echo "🤖 Starting crawler service..."
docker compose up -d crawler

echo "✅ Deployment complete."
