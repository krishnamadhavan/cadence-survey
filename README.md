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

Admin results: [http://localhost:3000/admin](http://localhost:3000/admin) (token from `ADMIN_TOKEN` in `.env`)

Health (Postgres + Redis): [http://localhost:3000/api/health](http://localhost:3000/api/health)

Public submit also accepts JSON. `teamId` is required so results can break down by team:

```bash
curl -sS -X POST http://localhost:3000/api/surveys/weekly-pulse/responses \
  -H 'content-type: application/json' \
  -d '{"teamId":"<team-uuid>","answers":[{"questionId":"<uuid>","value":4}]}'
```

Admin results API (cookie from `/admin/login`, or a bearer token):

```bash
curl -sS http://localhost:3000/api/admin/surveys/weekly-pulse/results \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Download the same published numbers (CSV or Excel) from the results page, or:

```bash
curl -sS -O -J "http://localhost:3000/api/admin/surveys/weekly-pulse/export?format=csv" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
curl -sS -O -J "http://localhost:3000/api/admin/surveys/weekly-pulse/export?format=xlsx" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
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
src/app/admin                          Results (token-gated)
src/app/api/health                     Postgres + Redis ping
src/app/api/surveys/[token]/responses  JSON submit (same path as the form)
src/app/api/admin/surveys/...          Results JSON and CSV/Excel export
src/db/schema.ts       surveys, questions, responses, answers, teams
src/db/seed.ts         weekly-pulse + teams + demo responses
src/lib/redis.ts       ioredis singleton
src/lib/rate-limit.ts  submit throttle
```

Next.js stays on the host so hot reload stays fast on macOS. Compose is the database layer.

## Data model

- `surveys` — title, status (`draft` / `open` / `closed`), unique `public_token`
- `teams` — Engineering, Product, Design, Operations (seeded)
- `questions` — `scale`, `choice`, or `text`
- `responses` — one row per submit, with `team_id`
- `answers` — jsonb `{ "value": ... }` per question

Scale averages under 3.0 are marked **low**, under 3.5 **watch**. Teams are sorted worst first. A team is only named when it has at least 3 responses; smaller groups are omitted or folded into “Too few to show” so a single person cannot be read off the results.

To add another survey later, insert a `surveys` row plus `questions`, or extend `src/db/seed.ts`.
