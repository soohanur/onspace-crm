# Phase 1 Architecture Notes

## Boundaries (where to extract later)

The monolith already follows the boundaries we'll cut along when scaling:

- **`apps/api/src/modules/scrape/`** — owns the BullMQ queue and orchestrates the scraper. Future: extract to a separate "scraping service" Pod, replace subprocess with Redis Streams consumer.
- **`apps/scraper/`** — already a separate process, talks to Postgres via `DATABASE_URL`. Future: ship as its own Docker image, scale horizontally with HPA on Redis queue depth.
- **`apps/api/src/modules/leads/`**, **`searches/`** — pure read APIs over Postgres. Future: cache + Meilisearch for full-text.

## Data flow

```
Frontend ──POST /api/scrape-jobs──▶ ScrapeService
                                       │ INSERT scrape_jobs
                                       │ queue.add('scrape', payload)
                                       ▼
                                 BullMQ (Redis)
                                       │
                                       ▼
                              ScrapeProcessor.process()
                                       │ spawn python -m scraper.main
                                       ▼
                              ┌─ Python (Playwright) ─┐
                              │ search → detail →     │
                              │ website enrich →      │
                              │ INSERT leads          │
                              └────────┬──────────────┘
                                       │ stdout JSON: {progress, saved, done}
                                       ▼
                              ScrapeProcessor updates scrape_jobs
                                       │
                                       ▼
                              Frontend polls /api/scrape-jobs/:id + /api/leads
```

## Why these choices

**Subprocess vs separate Python service** — In MVP, two processes is enough complexity. The contract is `DATABASE_URL` + stdout JSON, both swappable. Phase 2 can add a Python worker that reads from BullMQ directly (via a Python BullMQ client or a Redis Streams adapter).

**Direct Postgres writes from Python** — Avoids HTTP roundtrip per lead. The schema in `packages/db/prisma/schema.prisma` is the contract; both Node and Python honor it.

**Polling vs WebSocket** — TanStack Query polls every 1.5–2s while a job is running. Cheap, no extra infra, works behind any LB. Upgrade to SSE/WebSocket only when polling cost becomes real.

**Single shared dedup key** — `(source, dedup_hash)` where hash is `sha1(normalize(name) + normalize(phone) + normalize(address))`. ON CONFLICT DO UPDATE so re-scrapes refresh enrichment fields without losing rows.

## Anti-bot strategy (current)

- Headful Chromium (configurable via `SCRAPER_HEADFUL=true`)
- Realistic UA + viewport + locale + timezone
- `navigator.webdriver` stripped
- 2.5–5.5s jitter between search pages, 0.8–2s between detail pages
- Optional `SCRAPER_PROXY_URL` for residential proxy

If YellowPages starts throwing CAPTCHA / 403 in volume:
1. Add a residential proxy pool (rotate per page).
2. Add `playwright-stealth`.
3. Add adaptive backoff on 429/403.
4. Last resort: ScrapingBee / ScrapFly as a fetch backend.
