# Environment
include .env
export

# Docker Compose service names
DB_CONTAINER = backend-db-1
API_CONTAINER = backend-api-1
CRAWLER_CONTAINER = backend-crawler-1
DB_USER = postgres
DB_NAME = reddit_cluster

.PHONY: reset migrate drop logs logs-api logs-db logs-crawler logs-all kickstart migrate-up migrate-up-local migrate-priority-fix start-crawler stop-crawler test-crawl precalculate test test-integration sqlc generate

# Reset and migrate database
reset:
	docker compose down
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

# Force a localhost-based DATABASE_URL for running migrations from host
migrate-up-local:
	@echo "Running migrations against localhost using .env credentials"
	@DATABASE_URL="postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:5432/$(POSTGRES_DB)?sslmode=disable" \
	migrate -path migrations -database "$$DATABASE_URL" up

# Apply only the crawl_jobs priority column/index directly inside the db container (fallback)
migrate-priority-fix:
	@docker compose exec -T db psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) -c \
	"ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0; CREATE INDEX IF NOT EXISTS idx_crawl_jobs_priority ON crawl_jobs(priority);"

# Logs
logs-api:
	docker compose logs -f api

logs-db:
	docker compose logs -f db

logs-crawler:
	docker compose logs -f crawler

logs-all:
	docker compose logs -f

test-crawl:
	curl -v -X POST https://reddit-cluster-map.onnwee.me/api/crawl \
	  -H "Content-Type: application/json" \
	  -d '{"subreddit": "$(SUB)"}'

start-crawler:
	docker compose up -d crawler

stop-crawler:
	docker compose stop crawler

precalculate:
	docker compose run --rm precalculate /app/precalculate

# Run all unit tests
test:
	go test ./...

# Run only integration tests (skips unless TEST_DATABASE_URL is set)
test-integration:
	go test ./internal/graph -run Integration

# Generate sqlc code from SQL files
sqlc:
	@command -v sqlc >/dev/null 2>&1 || { echo "sqlc not found. Install from https://docs.sqlc.dev/en/latest/overview/install.html"; exit 1; }
	sqlc generate

# Alias for sqlc
generate: sqlc
