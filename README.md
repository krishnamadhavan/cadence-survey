# Cadence

Pulse surveys over a public link. Someone opens `/s/<token>`, answers a short check-in, and the response is stored in Postgres. Redis rate-limits the public submit path.

**Stack:** Next.js 16 (App Router) + TypeScript + Drizzle + Postgres 16 + Redis 7.

You do not need Postgres or Redis installed on the host. Docker Compose runs both.

## Prerequisites

- Node 20+ (this repo was scaffolded on Node 24)
- [pnpm](https://pnpm.io/) 10
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Compose

## First run

```bash
cp .env.example .env   # already done if you cloned this tree as-is
make setup             # start Postgres + Redis, migrate, seed
make dev               # http://localhost:3000
```

Seeded public survey: [http://localhost:3000/s/weekly-pulse](http://localhost:3000/s/weekly-pulse)

Health (Postgres + Redis): [http://localhost:3000/api/health](http://localhost:3000/api/health)

Public submit also accepts JSON:

```bash
curl -sS -X POST http://localhost:3000/api/surveys/weekly-pulse/responses \
  -H 'content-type: application/json' \
  -d '{"answers":[{"questionId":"<uuid>","value":4}]}'
```

## Everyday commands

| Command | What it does |
|---|---|
| `make up` | Start Postgres and Redis |
| `make down` | Stop them (volumes stay) |
| `make logs` | Follow container logs |
| `make setup` | Up + wait + migrate + seed |
| `make reset-db` | Wipe volumes and re-seed |
| `make dev` | Next.js on port 3000 |
| `pnpm db:studio` | Drizzle Studio for the tables |
| `pnpm db:generate` | Create a migration from schema changes |

Default host ports are **5435** (Postgres) and **6380** (Redis) so this stack does not collide with other Compose projects that already bind 5432 / 6379. Change `POSTGRES_PORT` / `REDIS_PORT` in `.env` and keep `DATABASE_URL` / `REDIS_URL` in sync if you need different ports.

## Layout

```
docker-compose.yml     Postgres + Redis only
src/app/s/[token]                      Public survey + submit + thanks
src/app/api/health                     Postgres + Redis ping
src/app/api/surveys/[token]/responses  JSON submit (same path as the form)
src/db/schema.ts       surveys, questions, responses, answers
src/db/seed.ts         weekly-pulse demo
src/lib/redis.ts       ioredis singleton
src/lib/rate-limit.ts  submit throttle
```

Next.js stays on the host so hot reload stays fast on macOS. Compose is the database layer.

## Data model

- `surveys` — title, status (`draft` / `open` / `closed`), unique `public_token`
- `questions` — `scale`, `choice`, or `text`
- `responses` — one row per submit
- `answers` — jsonb `{ "value": ... }` per question

To add another survey later, insert a `surveys` row plus `questions`, or extend `src/db/seed.ts`.
