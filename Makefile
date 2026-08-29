.PHONY: setup up down logs ps wait-db migrate seed reset-db dev health

ifneq (,$(wildcard .env))
include .env
export
endif

COMPOSE := docker compose

setup: up wait-db migrate seed
	@echo ""
	@echo "Stack is ready."
	@echo "  make dev                 # Next.js at http://localhost:3000"
	@echo "  open  /s/weekly-pulse    # seeded public survey"

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

wait-db:
	@echo "Waiting for Postgres…"
	@until $(COMPOSE) exec -T postgres pg_isready -U $${POSTGRES_USER:-cadence} -d $${POSTGRES_DB:-cadence} >/dev/null 2>&1; do \
		sleep 1; \
	done
	@echo "Waiting for Redis…"
	@until $(COMPOSE) exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do \
		sleep 1; \
	done
	@echo "Databases are up."

migrate:
	pnpm db:migrate

seed:
	pnpm db:seed

# Drops volumes (all survey data) and recreates from migrations + seed.
reset-db:
	$(COMPOSE) down -v
	$(MAKE) setup

dev:
	pnpm dev

health:
	@curl -sS http://localhost:3000/api/health | python3 -m json.tool
