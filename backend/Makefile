# Environment
include .env
export

# Docker Compose service names
DB_CONTAINER = backend-db-1
API_CONTAINER = backend-api-1
CRAWLER_CONTAINER = backend-crawler-1
DB_USER = postgres
DB_NAME = reddit_cluster

.PHONY: reset migrate drop logs logs-api logs-db logs-crawler logs-all kickstart migrate-up start-crawler stop-crawler test-crawl precalculate

# Reset and migrate database
reset:
	docker compose down -v
	docker compose up -d

migrate:
	cat ./migrations/schema.sql | docker exec -i $(DB_CONTAINER) psql -U $(DB_USER) -d $(DB_NAME)

migrate-up:
	@if [ -z "$$DATABASE_URL" ]; then \
		echo "Using local database URL..."; \
		export DATABASE_URL="postgres://postgres:$$POSTGRES_PASSWORD@localhost:5432/reddit_cluster?sslmode=disable"; \
	else \
		echo "Using provided DATABASE_URL..."; \
	fi; \
	migrate -path migrations -database "$$DATABASE_URL" up

# Logs
logs-api:
	docker compose logs -f api

logs-db:
	docker compose logs -f db

logs-crawler:
	docker compose logs -f crawler

logs-all:
	docker compose logs -f

# Drop all containers and volumes
drop:
	docker compose down -v

# Kickstart: reset and migrate
test-crawl:
	curl -v -X POST https://reddit-cluster-map.onnwee.me/api/crawl \
	  -H "Content-Type: application/json" \
	  -d '{"subreddit": "$(SUB)"}'

start-crawler:
	docker compose up -d crawler

stop-crawler:
	docker compose stop crawler

precalculate:
	go run ./cmd/precalculate
