# Cadence

Pulse surveys with a personal link for each employee. Someone opens `/s/<survey>/<code>`, answers a short check-in, and can change that answer until the pulse closes. The response is stored with their team, not their name. Redis rate-limits the submit path.

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

Seeded survey address: [http://localhost:3000/s/weekly-pulse](http://localhost:3000/s/weekly-pulse). That shared address does not accept answers. Personal links are listed on the survey in admin after people are on the roster.

Admin results: [http://localhost:3000/admin](http://localhost:3000/admin) — sign in with the seeded `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (`admin@cadence.local` / `cadence-admin` by default). If you already have a `.env` from before this change, copy those two keys from `.env.example` and run `pnpm db:seed` again. Re-seeding updates that admin’s password to match `.env`.

Employee roster: [http://localhost:3000/admin/employees](http://localhost:3000/admin/employees) — upload a CSV with `name,email,team`. Optional `role` and `tenure` (`<1yr`, `1-3yr`, `3yr+`) come in on the same file. Team must match a seeded team name or slug. Existing emails are updated. Leaving role and tenure out of a later file keeps the current values.

Health (Postgres + Redis): [http://localhost:3000/api/health](http://localhost:3000/api/health)

Submit accepts JSON for one personal link. The code comes from that person's link (`/s/<survey>/<code>`). The team is taken from their roster row on the first submit and kept when they change the answer. The response does not store who answered. Sending again through the same code replaces that one response until the pulse closes. A closed pulse does not accept a change. Optional `role` must match a role already set on the team stored with the response; it is stored as text on the response and is not linked back to a person. A repeat submit may keep the role it already stored.

```bash
curl -sS -X POST http://localhost:3000/api/surveys/weekly-pulse/responses \
  -H 'content-type: application/json' \
  -d '{"code":"<personal-code>","role":"Engineer","answers":[{"questionId":"<uuid>","value":4}]}'
```

Admin results API (session cookie from `/admin/login` or `POST /api/admin/login`):

```bash
curl -sS -c /tmp/cadence.jar -X POST http://localhost:3000/api/admin/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@cadence.local","password":"cadence-admin"}'
curl -sS -b /tmp/cadence.jar http://localhost:3000/api/admin/surveys/weekly-pulse/results
```

Download the same published numbers (CSV or Excel) from the results page. Written comments are only in the file (not the JSON results API), and only from teams that meet the 3-response floor. Or:

```bash
curl -sS -b /tmp/cadence.jar -O -J \
  "http://localhost:3000/api/admin/surveys/weekly-pulse/export?format=csv"
curl -sS -b /tmp/cadence.jar -O -J \
  "http://localhost:3000/api/admin/surveys/weekly-pulse/export?format=xlsx"
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
src/app/s/[token]                      Shared address (does not accept answers)
src/app/s/[token]/[code]               Personal link, one submit
src/app/admin                          Admin shell (surveys, employees, results)
src/app/api/health                     Postgres + Redis ping
src/app/api/surveys/[token]/responses  JSON submit for a personal code
src/app/api/admin/surveys/...          Results JSON and CSV/Excel export
src/db/schema.ts       surveys, questions, responses, answers, teams, pulse_links, admins
src/db/seed.ts         weekly-pulse + teams + demo responses + admin user
src/lib/redis.ts       ioredis singleton
src/lib/rate-limit.ts  submit throttle
```

Next.js stays on the host so hot reload stays fast on macOS. Compose is the database layer.

## Data model

- `admins` — seeded email + password hash; sessions live in Redis
- `surveys` — title, status (`draft` / `open` / `closed`), unique `public_token`
- `teams` — Engineering, Product, Design, Operations (seeded)
- `employees` — name, email, team, optional role and tenure band; bulk-loaded from CSV on `/admin/employees`
- `questions` — `scale`, `choice`, or `text`
- `pulse_links` — one unguessable code per employee per pulse. The link stores the response it wrote so that response can be replaced until the pulse closes
- `responses` — one row per person per pulse, with `team_id` and an optional role snapshot (not a link to the employee). Pulse reports can filter by that role. A role or team is only named when it still meets the anonymity floor. A role is also withheld when the people outside that role are too few to stand apart from the full report.
- `answers` — jsonb `{ "value": ... }` per question

Scale averages under 3.0 are marked **low**, under 3.5 **watch**. Teams are sorted worst first. A team is only named when it has at least 3 responses; smaller groups are omitted or folded into “Too few to show” so a single person cannot be read off the results.

To add another survey later, insert a `surveys` row plus `questions`, or extend `src/db/seed.ts`.
