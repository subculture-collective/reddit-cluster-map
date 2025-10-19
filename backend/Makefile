# Environment - gracefully handle missing .env
-include .env
export

# Docker Compose service names
DB_CONTAINER = backend-db-1
API_CONTAINER = backend-api-1
CRAWLER_CONTAINER = backend-crawler-1
DB_USER = $(POSTGRES_USER)
DB_NAME = $(POSTGRES_DB)

.PHONY: help setup check-env check-tools reset migrate drop logs logs-api logs-db logs-crawler logs-all kickstart migrate-up migrate-up-local migrate-priority-fix start-crawler stop-crawler test-crawl precalculate test test-integration test-all sqlc generate lint fmt smoke-test seed install-tools

# Default target - show help
.DEFAULT_GOAL := help

# Help target - shows all available targets with descriptions
help: ## Show this help message
	@echo "Available targets:"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "\033[36m%-30s\033[0m %s\n", "Target", "Description"} /^[a-zA-Z_-]+:.*?##/ { printf "\033[36m%-30s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

##@ Setup

setup: ## Initial setup - copy .env.example to .env and install tools
	@if [ ! -f .env ]; then \
		echo "Creating .env from .env.example..."; \
		cp .env.example .env; \
		echo "✓ Created .env - please edit it with your configuration"; \
		echo "  Required: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, POSTGRES_PASSWORD"; \
	else \
		echo ".env already exists"; \
	fi
	@echo ""
	@$(MAKE) check-tools

check-env: ## Check if .env file exists and is configured
	@if [ ! -f .env ]; then \
		echo "❌ Error: .env file not found"; \
		echo "Run 'make setup' to create it from .env.example"; \
		exit 1; \
	fi
	@if grep -q "your_client_id_here" .env 2>/dev/null || grep -q "change_me_in_production" .env 2>/dev/null; then \
		echo "⚠️  Warning: .env contains example values. Please configure:"; \
		echo "  - REDDIT_CLIENT_ID"; \
		echo "  - REDDIT_CLIENT_SECRET"; \
		echo "  - POSTGRES_PASSWORD"; \
	fi

check-tools: ## Check if required tools are installed
	@echo "Checking required tools..."
	@command -v docker >/dev/null 2>&1 || { echo "❌ docker not found. Install from https://docs.docker.com/get-docker/"; exit 1; }
	@echo "✓ docker"
	@command -v docker compose version >/dev/null 2>&1 || { echo "❌ docker compose not found. Install from https://docs.docker.com/compose/install/"; exit 1; }
	@echo "✓ docker compose"
	@command -v go >/dev/null 2>&1 || { echo "⚠️  go not found (optional for local dev). Install from https://go.dev/doc/install"; }
	@command -v go >/dev/null 2>&1 && echo "✓ go $$(go version | awk '{print $$3}')" || true
	@command -v sqlc >/dev/null 2>&1 && echo "✓ sqlc" || echo "⚠️  sqlc not found (needed for 'make generate'). Run 'make install-tools' or see https://docs.sqlc.dev/"
	@command -v migrate >/dev/null 2>&1 && echo "✓ migrate" || echo "⚠️  migrate not found (needed for 'make migrate-up'). Run 'make install-tools' or see https://github.com/golang-migrate/migrate"
	@echo ""

install-tools: ## Install sqlc and golang-migrate (requires Go)
	@command -v go >/dev/null 2>&1 || { echo "❌ go not found. Install Go first from https://go.dev/doc/install"; exit 1; }
	@echo "Installing sqlc..."
	@go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
	@echo "Installing golang-migrate..."
	@go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
	@echo "✓ Tools installed to $(shell go env GOPATH)/bin"
	@echo "  Make sure $(shell go env GOPATH)/bin is in your PATH"

##@ Development

reset: check-env ## Reset database - stop, start, and migrate
	docker compose down
	docker compose up -d
	@sleep 3
	@echo "Waiting for database to be ready..."
	@$(MAKE) migrate-up-local

migrate: check-env ## Run schema.sql directly in db container
	cat ./migrations/schema.sql | docker exec -i $(DB_CONTAINER) psql -U $(DB_USER) -d $(DB_NAME)

migrate-up: check-env ## Run migrations (auto-detects DATABASE_URL or uses .env)
	@command -v migrate >/dev/null 2>&1 || { echo "❌ migrate not found. Run 'make install-tools' or see https://github.com/golang-migrate/migrate"; exit 1; }
	@if [ -z "$$DATABASE_URL" ]; then \
		echo "Using local database URL..."; \
		export DATABASE_URL="postgres://postgres:$$POSTGRES_PASSWORD@localhost:5432/reddit_cluster?sslmode=disable"; \
	else \
		echo "Using provided DATABASE_URL..."; \
	fi; \
	migrate -path migrations -database "$$DATABASE_URL" up

migrate-up-local: check-env ## Run migrations against localhost using .env credentials
	@command -v migrate >/dev/null 2>&1 || { echo "❌ migrate not found. Run 'make install-tools' or see https://github.com/golang-migrate/migrate"; exit 1; }
	@echo "Running migrations against localhost using .env credentials"
	@DATABASE_URL="postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:5432/$(POSTGRES_DB)?sslmode=disable" \
	migrate -path migrations -database "$$DATABASE_URL" up

migrate-priority-fix: check-env ## Apply crawl_jobs priority column/index directly inside db container (fallback)
	@docker compose exec -T db psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) -c \
	"ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0; CREATE INDEX IF NOT EXISTS idx_crawl_jobs_priority ON crawl_jobs(priority);"

##@ Logs

logs-api: ## Follow API server logs
	docker compose logs -f api

logs-db: ## Follow database logs
	docker compose logs -f db

logs-crawler: ## Follow crawler logs
	docker compose logs -f crawler

logs-all: ## Follow all container logs
	docker compose logs -f

##@ Services

start-crawler: check-env ## Start the crawler service
	docker compose up -d crawler

stop-crawler: ## Stop the crawler service
	docker compose stop crawler

precalculate: check-env ## Run graph precalculation
	docker compose run --rm precalculate /app/precalculate

##@ Testing and Quality

test: ## Run all Go unit tests
	go test ./...

test-integration: ## Run integration tests (requires TEST_DATABASE_URL)
	go test ./internal/graph -run Integration

test-all: test ## Run all tests (alias for 'test')

lint: ## Run Go linters (go vet and gofmt check)
	@echo "Running go vet..."
	@go vet ./...
	@echo "✓ go vet passed"
	@echo ""
	@echo "Checking gofmt..."
	@if [ -n "$$(gofmt -l .)" ]; then \
		echo "❌ The following files need formatting:"; \
		gofmt -l .; \
		echo ""; \
		echo "Run 'make fmt' to fix formatting"; \
		exit 1; \
	fi
	@echo "✓ gofmt check passed"

fmt: ## Format Go code with gofmt
	@echo "Formatting Go code..."
	@gofmt -w .
	@echo "✓ Code formatted"

smoke-test: check-env ## Run smoke tests (basic API health checks)
	@echo "Running smoke tests..."
	@./scripts/smoke-test.sh

seed: check-env ## Seed database with sample data
	@echo "Seeding database..."
	@./scripts/seed.sh

##@ Code Generation

sqlc: ## Generate sqlc code from SQL files
	@command -v sqlc >/dev/null 2>&1 || { echo "❌ sqlc not found. Run 'make install-tools' or see https://docs.sqlc.dev/"; exit 1; }
	sqlc generate
	@echo "✓ sqlc code generated"

generate: sqlc ## Alias for sqlc

##@ Crawling

test-crawl: check-env ## Test crawl endpoint (requires SUB=subreddit_name)
	@if [ -z "$(SUB)" ]; then \
		echo "❌ Error: SUB variable not set"; \
		echo "Usage: make test-crawl SUB=AskReddit"; \
		exit 1; \
	fi
	curl -v -X POST $${API_URL:-http://localhost:8000}/api/crawl \
	  -H "Content-Type: application/json" \
	  -d '{"subreddit": "$(SUB)"}'

##@ Backups

# Trigger a one-off backup (requires db to be running)
backup-now: check-env ## Create a database backup
	@echo "Running backup via precalculate service..."
	@docker compose run --rm --no-deps \
		-e PGHOST=$${PGHOST:-db} \
		-e POSTGRES_USER=$${POSTGRES_USER} \
		-e POSTGRES_PASSWORD=$${POSTGRES_PASSWORD} \
		-e POSTGRES_DB=$${POSTGRES_DB} \
		precalculate /app/scripts/backup.sh

# Show files in backup volume
backups-ls: ## List backup files
	@docker run --rm -v backend_pgbackups:/data busybox sh -c 'ls -lh /data | sort -k9'

# Print host path to the backup volume
backups-path: ## Show backup volume path
	@docker volume inspect backend_pgbackups --format '{{ .Mountpoint }}'

# Copy latest backup to local ./backups (host) without starting any services
backups-download-latest: ## Download the latest backup to ./backups/
	@mkdir -p backups
		@docker run --rm -v backend_pgbackups:/data -v $$PWD/backups:/out busybox /bin/sh -lc \
				"set -e; echo 'Listing backups in /data'; ls -lh /data 2>/dev/null || true; \
				sel=; for f in $$(ls -1 /data 2>/dev/null | sort -r || true); do \
					if [ -s \"/data/$$f\" ]; then sel=\"$$f\"; break; fi; \
				done; \
				if [ -n \"$$sel\" ]; then echo \"Copying: $$sel\"; cp -v /data/\"$$sel\" /out/; else echo 'No non-empty backups found in volume backend_pgbackups'; fi"

# Remove zero-byte files and keep only the last N non-empty backups (default 14)
backups-tidy: ## Remove old backups (keep last 14, set KEEP=N to override)
		@docker run --rm -e KEEP=$${KEEP:-14} -v backend_pgbackups:/data busybox /bin/sh -lc \
			"set -e; echo 'Before tidy:'; ls -lh /data || true; \
			find /data -type f -size 0 -print -delete || true; \
			cnt=0; for f in $$(ls -1t /data 2>/dev/null || true); do \
			  [ -s /data/$$f ] || continue; cnt=$$((cnt+1)); \
			  if [ $$cnt -le $$KEEP ]; then continue; fi; echo Deleting /data/$$f; rm -f /data/$$f; \
			done; echo 'After tidy:'; ls -lh /data || true"

# Create a tar.gz snapshot of the raw Postgres data volume into the backups volume
.PHONY: backups-snapshot-volume
backups-snapshot-volume: ## Create a snapshot of the Postgres data volume
	@echo "Snapshotting backend_postgres_data into backend_pgbackups..."
	@docker run --rm -v backend_postgres_data:/pgdata:ro -v backend_pgbackups:/out alpine sh -c \
		"apk add --no-cache tar >/dev/null 2>&1 || true; cd /pgdata && ts=$$(date +%Y%m%d_%H%M%S) && tar -czf /out/pgdata_$$ts.tar.gz . && echo Created /out/pgdata_$$ts.tar.gz"
