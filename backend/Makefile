# Environment
-include .env
export

# Docker Compose service names
DB_CONTAINER = backend-db-1
API_CONTAINER = backend-api-1
CRAWLER_CONTAINER = backend-crawler-1
DB_USER = $(POSTGRES_USER)
DB_NAME = reddit_cluster

.PHONY: setup reset migrate drop logs logs-api logs-db logs-crawler logs-all kickstart migrate-up migrate-up-local migrate-priority-fix start-crawler stop-crawler test-crawl precalculate test test-integration sqlc generate

# Setup environment file
setup:
	@if [ ! -f .env.example ]; then \
		echo "ERROR: .env.example file not found!"; \
		echo ""; \
		echo "The .env.example file should exist in the backend directory."; \
		echo "Please ensure you have the latest version of the repository."; \
		exit 1; \
	fi
	@if [ -f .env ]; then \
		echo ".env file already exists. Not overwriting."; \
		echo "To recreate, delete .env first or manually copy from .env.example"; \
	else \
		cp .env.example .env; \
		echo ".env file created from .env.example"; \
		echo "Please edit .env and configure your settings before running the application."; \
	fi

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

# --- Backups helpers (precalculate service writes dumps to named volume 'backend_pgbackups') ---
.PHONY: backup-now backups-ls backups-path backups-download-latest backups-tidy

# Trigger a one-off backup (requires db to be running)
backup-now:
	@echo "Running backup via precalculate service..."
	@docker compose run --rm --no-deps \
		-e PGHOST=$${PGHOST:-db} \
		-e POSTGRES_USER=$${POSTGRES_USER} \
		-e POSTGRES_PASSWORD=$${POSTGRES_PASSWORD} \
		-e POSTGRES_DB=$${POSTGRES_DB} \
		precalculate /app/scripts/backup.sh

# Show files in backup volume
backups-ls:
	@docker run --rm -v backend_pgbackups:/data busybox sh -c 'ls -lh /data | sort -k9'

# Print host path to the backup volume
backups-path:
	@docker volume inspect backend_pgbackups --format '{{ .Mountpoint }}'

# Copy latest backup to local ./backups (host) without starting any services
backups-download-latest:
	@mkdir -p backups
		@docker run --rm -v backend_pgbackups:/data -v $$PWD/backups:/out busybox /bin/sh -lc \
				"set -e; echo 'Listing backups in /data'; ls -lh /data 2>/dev/null || true; \
				sel=; for f in $$(ls -1 /data 2>/dev/null | sort -r || true); do \
					if [ -s \"/data/$$f\" ]; then sel=\"$$f\"; break; fi; \
				done; \
				if [ -n \"$$sel\" ]; then echo \"Copying: $$sel\"; cp -v /data/\"$$sel\" /out/; else echo 'No non-empty backups found in volume backend_pgbackups'; fi"

	# Remove zero-byte files and keep only the last N non-empty backups (default 14)
	backups-tidy:
		@docker run --rm -e KEEP=$${KEEP:-14} -v backend_pgbackups:/data busybox /bin/sh -lc \
			"set -e; echo 'Before tidy:'; ls -lh /data || true; \
			find /data -type f -size 0 -print -delete || true; \
			cnt=0; for f in $$(ls -1t /data 2>/dev/null || true); do \
			  [ -s /data/$$f ] || continue; cnt=$$((cnt+1)); \
			  if [ $$cnt -le $$KEEP ]; then continue; fi; echo Deleting /data/$$f; rm -f /data/$$f; \
			done; echo 'After tidy:'; ls -lh /data || true"

# Create a tar.gz snapshot of the raw Postgres data volume into the backups volume
.PHONY: backups-snapshot-volume
backups-snapshot-volume:
	@echo "Snapshotting backend_postgres_data into backend_pgbackups..."
	@docker run --rm -v backend_postgres_data:/pgdata:ro -v backend_pgbackups:/out alpine sh -c \
		"apk add --no-cache tar >/dev/null 2>&1 || true; cd /pgdata && ts=$$(date +%Y%m%d_%H%M%S) && tar -czf /out/pgdata_$$ts.tar.gz . && echo Created /out/pgdata_$$ts.tar.gz"

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
