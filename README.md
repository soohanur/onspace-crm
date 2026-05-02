# OnspaceCRM — Phase 1 (MVP)

A modular monolith for scraping YellowPages business listings and viewing them in a CRM-style dashboard.

## What's in Phase 1

- **Scrape YellowPages** by category + location (Playwright in Python)
- **Enrich** each business with email / social links pulled from its own website
- **Dashboard UI** (Next.js) with sidebar, Lead Scraper page, Global Leads view
- **BullMQ queue** so scrape jobs run in the background

## What's intentionally NOT built yet

| Future phase | Skipped here |
|---|---|
| Multi-tenant | No `tenant_id`. Single-workspace. |
| Contacts (per-lead) | Owner fields stored directly on `leads`. |
| Activities / tasks / campaigns | Sidebar links exist but pages are empty shells. |
| Workflow engine | No event bus, no rules. |
| Microservices / Kafka | Single Nest API + Python subprocess + Postgres + Redis. |
| Owner LinkedIn scraping | We emit a Google search URL; no automated scraping of LinkedIn (it blocks heavily). |
| Proxy rotation pool | Single optional `SCRAPER_PROXY_URL`. |
| Auth | None. Local dev only. |

## Stack

| Layer | Choice |
|---|---|
| Backend | NestJS + Prisma + BullMQ |
| Frontend | Next.js 15 (App Router) + Tailwind + TanStack Query |
| Scraper | Python 3 + Playwright (Chromium) |
| Database | PostgreSQL 16 |
| Queue | Redis 7 + BullMQ |
| Monorepo | pnpm + Turborepo |

## Getting started

Prereqs: Node 20+, pnpm 9+, Python 3.10+. Docker is optional — if you don't have it, the project also runs against a user-mode Postgres + Redis (see `scripts/dev.sh`).

### With Docker
```bash
pnpm install
pnpm infra:up                         # postgres + redis via docker compose
cp .env.example .env
pnpm --filter @onspace/db prisma:migrate -- --name init
(cd apps/scraper && pnpm setup)       # creates .venv, installs Playwright Chromium
pnpm dev                              # turbo runs api (4000) + web (3000)
```

### Without Docker (user-space)
A one-time setup downloads portable Postgres + Redis binaries into `~/.local/onspace-dev/` and runs them as your user. See [docs/SETUP_NO_DOCKER.md](docs/SETUP_NO_DOCKER.md). Once set up:
```bash
./scripts/dev.sh
```

Open <http://localhost:3000>, click **Lead Scraper**, type a category like `dentist` and a location like `Brooklyn, NY`, hit **Start Scrape**. Results stream into the table as the Python worker writes them to Postgres. Each lead carries: business name, all listed phones, email (harvested from website if YP doesn't expose one), website, full address + lat/lng, all categories, rating + review count, year established, hours of operation, description, logo, photos, social links (Facebook/LinkedIn/Twitter/Instagram/YouTube), and a pre-built Google search URL for finding the owner on LinkedIn.

## Architecture (Phase 1)

```
Browser (Next.js)
   │  POST /api/scrape-jobs
   ▼
NestJS API ──── BullMQ(Redis) ─── ScrapeProcessor (in-process worker)
                                        │ spawn
                                        ▼
                                Python Playwright
                                        │ INSERT
                                        ▼
                                  PostgreSQL
                                        ▲
                                        │ poll
                                  Next.js (TanStack Query, 1.5s)
```

Why a subprocess (and not a separate Python service): one process tree keeps `pnpm dev` simple. The Python scraper writes leads directly to Postgres via `DATABASE_URL`. Status events flow back as JSON lines on stdout. We only orchestrate and update job state from Node.

## Repo layout

```
apps/
  api/        NestJS — leads / searches / scrape-jobs + BullMQ worker
  web/        Next.js — sidebar shell + scraper + leads pages
  scraper/    Python — Playwright YellowPages scraper
packages/
  db/         Prisma schema + generated client
  shared-types/  zod schemas shared between FE/BE
  config/     base tsconfig
infra/docker/  docker-compose for Postgres + Redis
```

## Next phases (preview)

1. **Contacts + activities** — split owner fields into a real `contacts` table; add an activity timeline.
2. **Lead Stage + Groups** — pipeline kanban + manual/smart groups.
3. **Email Campaigns** — SES/SendGrid integration with open/click tracking.
4. **Workflow engine** — JSON-rule triggers on events (`email.opened` → update stage).
5. **Multi-tenant + auth** — JWT, RBAC, `tenant_id` on every row.
