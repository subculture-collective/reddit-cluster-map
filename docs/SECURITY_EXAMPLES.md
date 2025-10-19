# Security Features Usage Examples

This file provides practical examples of using the security features.

## Example 1: Basic Setup (Development)

```bash
# .env file for development
DATABASE_URL=postgres://postgres:password@localhost:5432/reddit_cluster?sslmode=disable

# Security settings - permissive for development
ENABLE_RATE_LIMIT=true
RATE_LIMIT_GLOBAL=1000
RATE_LIMIT_GLOBAL_BURST=2000
RATE_LIMIT_PER_IP=100
RATE_LIMIT_PER_IP_BURST=200

# Allow local development origins
CORS_ALLOWED_ORIGINS="http://localhost:5173,http://localhost:3000"

# Reddit OAuth (use your credentials)
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_REDIRECT_URI=http://localhost:8000/auth/callback
```

## Example 2: Production Setup

```bash
# .env file for production
DATABASE_URL=postgres://user:password@db:5432/reddit_cluster?sslmode=require

# Security settings - stricter for production
ENABLE_RATE_LIMIT=true
RATE_LIMIT_GLOBAL=100
RATE_LIMIT_GLOBAL_BURST=200
RATE_LIMIT_PER_IP=10
RATE_LIMIT_PER_IP_BURST=20

# Restrict to your production domains
CORS_ALLOWED_ORIGINS="https://reddit-cluster-map.example.com,https://app.example.com"

# Strong admin token (use a secure random value)
ADMIN_API_TOKEN=your-very-secure-random-token-here

# Reddit OAuth (production credentials)
REDDIT_CLIENT_ID=prod_client_id
REDDIT_CLIENT_SECRET=prod_client_secret
REDDIT_REDIRECT_URI=https://reddit-cluster-map.example.com/auth/callback
```

## Example 3: Staging with Wildcard Subdomain

```bash
# .env file for staging
DATABASE_URL=postgres://user:password@db:5432/reddit_cluster?sslmode=require

# Medium security settings
ENABLE_RATE_LIMIT=true
RATE_LIMIT_GLOBAL=200
RATE_LIMIT_GLOBAL_BURST=400
RATE_LIMIT_PER_IP=20
RATE_LIMIT_PER_IP_BURST=40

# Allow all staging subdomains
CORS_ALLOWED_ORIGINS="*.staging.example.com"
```

## Example 4: Testing API with cURL

### Testing Rate Limits

```bash
# Test normal request
curl -X POST http://localhost:8000/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"subreddit":"golang"}'

# Test rate limiting (make many requests quickly)
for i in {1..30}; do
  curl -X GET http://localhost:8000/api/graph?max_nodes=100
  echo "Request $i"
done
# You should see 429 errors after hitting the limit
```

### Testing CORS

```bash
# Simulate browser preflight request
curl -X OPTIONS http://localhost:8000/api/graph \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Check response headers:
# Access-Control-Allow-Origin: http://localhost:5173
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
# Access-Control-Max-Age: 300
```

### Testing Input Validation

```bash
# Valid request
curl -X POST http://localhost:8000/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"subreddit":"AskReddit"}'
# Response: 202 Accepted

# Invalid - special characters
curl -X POST http://localhost:8000/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"subreddit":"ask/reddit"}'
# Response: 400 Bad Request

# Invalid - missing content-type
curl -X POST http://localhost:8000/api/crawl \
  -d '{"subreddit":"golang"}'
# Response: 400 Bad Request

# Invalid - malformed JSON
curl -X POST http://localhost:8000/api/crawl \
  -H "Content-Type: application/json" \
  -d '{invalid json}'
# Response: 400 Bad Request
```

## Example 5: Docker Compose Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      # Security
      - ENABLE_RATE_LIMIT=true
      - RATE_LIMIT_GLOBAL=100
      - RATE_LIMIT_GLOBAL_BURST=200
      - RATE_LIMIT_PER_IP=10
      - RATE_LIMIT_PER_IP_BURST=20
      - CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
      # Database
      - DATABASE_URL=postgres://postgres:password@db:5432/reddit_cluster?sslmode=disable
      # Reddit
      - REDDIT_CLIENT_ID=${REDDIT_CLIENT_ID}
      - REDDIT_CLIENT_SECRET=${REDDIT_CLIENT_SECRET}
    depends_on:
      - db
    networks:
      - app-network

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=reddit_cluster
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app-network

networks:
  app-network:

volumes:
  postgres_data:
```

## Example 6: Monitoring Rate Limits

To monitor rate limit events, you can add custom logging:

```go
// Example: Add this to your application to log rate limit events
package main

import (
    "log"
    "net/http"
)

func logRateLimitMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        recorder := &responseRecorder{ResponseWriter: w, statusCode: 200}
        next.ServeHTTP(recorder, r)
        
        if recorder.statusCode == http.StatusTooManyRequests {
            clientIP := getClientIP(r)
            log.Printf("⚠️ Rate limit exceeded for IP %s on %s %s", 
                clientIP, r.Method, r.URL.Path)
        }
    })
}

type responseRecorder struct {
    http.ResponseWriter
    statusCode int
}

func (r *responseRecorder) WriteHeader(code int) {
    r.statusCode = code
    r.ResponseWriter.WriteHeader(code)
}
```

## Example 7: Testing with Different Origins

```bash
# Test allowed origin
curl -X GET http://localhost:8000/api/graph \
  -H "Origin: http://localhost:5173" \
  -v | grep "Access-Control"
# Should show: Access-Control-Allow-Origin: http://localhost:5173

# Test disallowed origin
curl -X GET http://localhost:8000/api/graph \
  -H "Origin: http://evil.com" \
  -v | grep "Access-Control"
# Should not show any Access-Control headers
```

## Example 8: Load Testing Rate Limits

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test rate limits with 100 requests, 10 concurrent
ab -n 100 -c 10 \
  -H "Content-Type: application/json" \
  http://localhost:8000/api/graph

# Check the results:
# - Successful requests: Should be rate-limited
# - Failed requests: Will show 429 errors
# - Time per request: Shows response time
```

## Example 9: Security Headers Verification

```bash
# Check all security headers
curl -I http://localhost:8000/api/graph

# Expected headers:
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# Content-Security-Policy: default-src 'self'; ...
# Referrer-Policy: strict-origin-when-cross-origin
# Permissions-Policy: geolocation=(), microphone=(), camera=()
```

## Example 10: Nginx Reverse Proxy Setup

```nginx
# /etc/nginx/sites-available/reddit-cluster-map

upstream api_backend {
    server localhost:8000;
}

server {
    listen 80;
    server_name api.example.com;

    # Forward real client IP to backend
    location / {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# For HTTPS (recommended for production)
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Example 11: Kubernetes Deployment

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: reddit-cluster-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: reddit-cluster-api
  template:
    metadata:
      labels:
        app: reddit-cluster-api
    spec:
      containers:
      - name: api
        image: your-registry/reddit-cluster-api:latest
        ports:
        - containerPort: 8000
        env:
        - name: ENABLE_RATE_LIMIT
          value: "true"
        - name: RATE_LIMIT_GLOBAL
          value: "100"
        - name: RATE_LIMIT_PER_IP
          value: "10"
        - name: CORS_ALLOWED_ORIGINS
          value: "https://example.com,https://app.example.com"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        - name: REDDIT_CLIENT_ID
          valueFrom:
            secretKeyRef:
              name: reddit-credentials
              key: client-id
```

## Troubleshooting Common Issues

### Issue: Rate limits too strict

```bash
# Increase limits in .env
RATE_LIMIT_PER_IP=50
RATE_LIMIT_PER_IP_BURST=100
```

### Issue: CORS errors in browser

```bash
# Add your frontend URL to allowed origins
CORS_ALLOWED_ORIGINS="http://localhost:5173,https://yourdomain.com"
```

### Issue: Rate limits not working behind proxy

```bash
# Ensure proxy forwards X-Forwarded-For header
# Check nginx/apache configuration
```

### Issue: Need to disable rate limiting temporarily

```bash
# Set in .env (NOT recommended for production)
ENABLE_RATE_LIMIT=false
```
