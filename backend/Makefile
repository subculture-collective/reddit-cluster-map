include .env
export

.PHONY: reset migrate drop logs kickstart

reset: drop migrate

drop:
	psql $(DB_URL) -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

migrate:
	psql $(DB_URL) -f migrations/schema.sql

logs:
	docker compose logs -f app

SUB ?= LeftoversH3

kickstart:
ifeq ($(strip $(SUB)),)
	$(error SUB (subreddit) is required. Usage: make kickstart SUB=AskReddit)
endif
	curl -X POST https://reddit-cluster-map.onnwee.me/crawl \
	  -H "Content-Type: application/json" \
	  -d '{"subreddit": "$(SUB)"}'
