#!/bin/bash

# Job System API Examples
# Make sure to set ADMIN_API_TOKEN environment variable

API_URL="${API_URL:-http://localhost:8000}"
TOKEN="${ADMIN_API_TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "Error: ADMIN_API_TOKEN environment variable is required"
  exit 1
fi

# Helper function to make API calls
api_call() {
  local method=$1
  local endpoint=$2
  local data=$3
  
  if [ -z "$data" ]; then
    curl -s -X "$method" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      "$API_URL$endpoint"
  else
    curl -s -X "$method" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$API_URL$endpoint"
  fi
}

echo "=== Job System API Examples ==="
echo ""

# 1. Get job statistics
echo "1. Getting job statistics..."
api_call GET "/api/admin/jobs/stats" | jq '.'
echo ""

# 2. List queued jobs
echo "2. Listing queued jobs..."
api_call GET "/api/admin/jobs?status=queued&limit=5" | jq '.'
echo ""

# 3. List failed jobs
echo "3. Listing failed jobs..."
api_call GET "/api/admin/jobs?status=failed&limit=5" | jq '.'
echo ""

# 4. Boost priority for a job (replace {id} with actual job ID)
# echo "4. Boosting priority for job 123..."
# api_call POST "/api/admin/jobs/123/boost" '{"boost": 20}' | jq '.'
# echo ""

# 5. Bulk retry failed jobs (replace with actual job IDs)
# echo "5. Bulk retrying failed jobs..."
# api_call POST "/api/admin/jobs/bulk/retry" '{"job_ids": [1, 2, 3]}' | jq '.'
# echo ""

# 6. Create a scheduled job
echo "6. Creating a scheduled job for daily AskReddit crawls..."
api_call POST "/api/admin/scheduled-jobs" '{
  "name": "daily-askreddit-example",
  "description": "Daily crawl of AskReddit at midnight",
  "subreddit_id": 1,
  "cron_expression": "@daily",
  "enabled": true,
  "priority": 10
}' | jq '.'
echo ""

# 7. List scheduled jobs
echo "7. Listing all scheduled jobs..."
api_call GET "/api/admin/scheduled-jobs?limit=10" | jq '.'
echo ""

# 8. Toggle a scheduled job (replace {id} with actual scheduled job ID)
# echo "8. Disabling scheduled job 1..."
# api_call POST "/api/admin/scheduled-jobs/1/toggle" '{"enabled": false}' | jq '.'
# echo ""

# 9. Update job priority
# echo "9. Updating priority for job 123..."
# api_call PUT "/api/admin/jobs/123/priority" '{"priority": 50}' | jq '.'
# echo ""

# 10. Bulk update job status
# echo "10. Bulk updating job status to queued..."
# api_call PUT "/api/admin/jobs/bulk/status" '{"job_ids": [1, 2, 3], "status": "queued"}' | jq '.'
# echo ""

echo "=== Examples Complete ==="
