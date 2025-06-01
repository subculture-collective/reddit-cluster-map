DB_URL ?= postgres://postgres:postgres@localhost:5432/reddit_cluster?sslmode=disable

.PHONY: reset migrate drop

reset: drop migrate

drop:
	psql $(DB_URL) -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

migrate:
	psql $(DB_URL) -f migrations/schema.sql

logs:
	docker compose logs -f app