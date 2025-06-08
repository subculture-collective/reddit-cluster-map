#!/bin/bash
set -e

echo "🚀 Pulling latest changes..."
git -C /home/onnwee/projects/reddit-cluster-map pull origin deploy

echo "📦 Building and restarting containers..."
cd /home/onnwee/projects/reddit-cluster-map

# Check if frontend has changed since last deploy
if git diff --name-only HEAD@{1} HEAD | grep '^frontend/'; then
  echo "🌐 Frontend changes detected, rebuilding..."
  cd frontend
  npm install
  npm run build
  cd ../backend
else
  echo "🌐 No frontend changes detected, skipping build."
  cd backend
fi

# Build and restart services first
echo "🏗️ Building and restarting services..."
docker compose up -d --build

# Run database migrations inside the container
echo "🔄 Running database migrations..."
docker compose exec -T db psql -U postgres -d reddit_cluster -f /docker-entrypoint-initdb.d/migrations/schema.sql

# Start the crawler service
echo "🤖 Starting crawler service..."
docker compose up -d crawler

echo "✅ Deployment complete."
