include .env
export

.PHONY: reset migrate drop logs kickstart migrate-up start-crawler stop-crawler

DB_CONTAINER = reddit_db
DB_USER = postgres
DB_NAME = reddit_cluster
DB_PASSWORD = 7onr1MC/O2DLEjIr7lqCNE125o6Wd5Phmh6z3mioipE=

reset:
	docker compose down -v
	docker compose up -d

migrate:
	cat ./migrations/schema.sql | docker exec -i $(DB_CONTAINER) psql -U $(DB_USER) -d $(DB_NAME)

migrate-up:
	@if [ -z "$$DATABASE_URL" ]; then \
		echo "Using local database URL..."; \
		export DATABASE_URL="postgres://postgres:7onr1MC%2FO2DLEjIr7lqCNE125o6Wd5Phmh6z3mioipE%3D@localhost:5432/reddit_cluster?sslmode=disable"; \
	else \
		echo "Using provided DATABASE_URL..."; \
	fi; \
	migrate -path migrations -database "$$DATABASE_URL" up

logs:
	docker compose logs -f app

drop:
	docker compose down -v

kickstart: reset migrate

SUB ?= LeftoversH3
kickstart:
	curl -v -X POST https://reddit-cluster-map.onnwee.me/crawl \
	  -H "Content-Type: application/json" \
	  -d '{"subreddit": "$(SUB)"}'

start-crawler:
	docker compose up -d crawler

stop-crawler:
	docker compose stop crawler
