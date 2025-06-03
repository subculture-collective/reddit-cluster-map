include .env
export

.PHONY: reset migrate drop logs kickstart

DB_CONTAINER = reddit_db
DB_NAME = reddit_cluster
DB_USER = postgres

reset: drop migrate

drop:
	docker exec -i $(DB_CONTAINER) psql -U $(DB_USER) -d $(DB_NAME) -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

migrate:
	cat ./migrations/schema.sql | docker exec -i $(DB_CONTAINER) psql -U $(DB_USER) -d $(DB_NAME)

logs:
	docker compose logs -f app

SUB ?= LeftoversH3
kickstart:
	curl -v -X POST https://reddit-cluster-map.onnwee.me/crawl \
	  -H "Content-Type: application/json" \
	  -d '{"subreddit": "$(SUB)"}'
