# OnspaceCRM — Project & Architecture

A complete reference for what we're building, why, how it's structured, and where it's going.

---

## 1. The Vision

**OnspaceCRM** is a production-grade CRM + automated lead-generation platform.
Instead of users typing leads into a form (HubSpot / Pipedrive style), the system **scrapes them from public business directories** (starting with YellowPages), enriches them, and turns them into a workable sales pipeline.

The end goal:

```
   ┌────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌────────┐
   │ Scrape │  →  │ Enrich   │  →  │ Organize │  →  │ Outreach │  →  │ Close  │
   │ (auto) │     │ (auto)   │     │ (CRM)    │     │ (email)  │     │ (sale) │
   └────────┘     └──────────┘     └──────────┘     └──────────┘     └────────┘
```

A single user of the system should be able to:

1. Type `"plumber"` + `"Los Angeles, CA"` → get every business that matches with phone, email, website, social links, owner name, address, rating, hours.
2. Filter / search / group those leads in a CRM-style dashboard.
3. Send personalized emails directly from the CRM (Gmail OAuth) and track replies.
4. Run automation rules ("if no reply in 3 days → create follow-up task") later in the roadmap.

---

## 2. High-Level Architecture

### Tech Stack

| Layer       | Choice                                   | Why                                                  |
|-------------|------------------------------------------|------------------------------------------------------|
| Frontend    | Next.js 15 (App Router) + Tailwind 3     | Industry-standard SSR React, fast iteration         |
| Backend     | NestJS 10 + TypeScript                   | Modular DI, scales from monolith → microservices    |
| Database    | PostgreSQL 16 + Prisma 5                 | Reliable, indexed, type-safe ORM                    |
| Queue       | BullMQ + Redis 7                         | Reliable background job processing                  |
| Scraper     | Python 3.12 + Playwright (Chromium)      | Best-in-class headless browser, handles Cloudflare  |
| Auth (email)| Gmail OAuth via `googleapis`             | Standard, lets users send from their own Gmail      |
| Monorepo    | pnpm workspaces + Turborepo              | Single repo, shared types, fast builds              |
| Hosting     | (TBD — Vercel + Railway / AWS)           | MVP runs locally, no infra committed yet            |

### Repo Structure

```
onspace-crm/
├── apps/
│   ├── api/              NestJS API + BullMQ workers
│   ├── web/              Next.js dashboard
│   └── scraper/          Python Playwright scraper
├── packages/
│   ├── db/               Prisma schema + migrations + generated client
│   ├── shared-types/     zod schemas shared FE/BE
│   └── config/           Base tsconfig
├── infra/docker/         docker-compose for Postgres + Redis
├── docs/                 Deeper docs (SETUP_NO_DOCKER, OWNER_DISCOVERY)
├── scripts/dev.sh        One-command dev launcher (no Docker needed)
├── PROJECT.md            ← this file
└── README.md
```

### Modular Monolith (NestJS)

The API is a single Nest process with seven feature modules. Each module has clear DDD-style boundaries (controllers · services · DTOs) so any of them can be extracted into its own service later without rewrites.

```
apps/api/src/modules/
├── health/      GET /api/health
├── scrape/      Scrape jobs + BullMQ processor (spawns Python subprocess)
├── searches/    Autocomplete suggestions for category/location
├── leads/       Lead listing, filtering, detail, facets, delete
├── groups/      Manual + smart groups, member operations
├── notes/       Per-lead notes
└── email/       Gmail OAuth + send + per-lead history
```

### End-to-End Data Flow

```
            ┌────────────────────┐
            │   Next.js Web UI   │
            │ (TanStack Query)   │
            └────────┬───────────┘
                     │  REST + JSON
                     ▼
            ┌────────────────────┐
            │   NestJS API       │
            │   (port 4000)      │
            └────┬───────────┬───┘
                 │           │
   ┌─────────────┘           └────────────┐
   │                                       │
   ▼                                       ▼
┌────────────┐                     ┌──────────────────┐
│ PostgreSQL │                     │   BullMQ queue   │
│  (5432)    │                     │   (Redis 6379)   │
└────────────┘                     └────────┬─────────┘
   ▲   ▲                                    │
   │   │                                    ▼
   │   │                          ┌─────────────────────┐
   │   │   direct INSERT          │ ScrapeProcessor     │
   │   └──────────────────────────┤ (spawns subprocess) │
   │                              └────────┬────────────┘
   │                                       │
   │                                       ▼
   │                              ┌─────────────────────┐
   │   stdout JSON events         │ Python Playwright   │
   └──────────────────────────────┤ (yellowpages.py +   │
                                  │  website.py + db.py)│
                                  └─────────────────────┘
```

---

## 3. Data Model

Live tables (Prisma schema is in `packages/db/prisma/schema.prisma`):

| Table                | Purpose                                              |
|----------------------|------------------------------------------------------|
| `scrape_jobs`        | One row per `POST /scrape-jobs`. Status, counts.     |
| `leads`              | Every business found. Rich fields (see below).       |
| `lead_groups`        | Manual + smart groups (`type` enum).                 |
| `lead_group_members` | Manual group membership (composite PK).              |
| `notes`              | Per-lead text notes (append-only, deletable).        |
| `email_accounts`     | Connected Gmail OAuth tokens (refresh encrypted).    |
| `email_logs`         | One row per send. Future-ready tracking columns.     |

### Lead schema (most important)

```prisma
model Lead {
  id             String   @id @default(uuid())
  jobId          String?
  source         String   @default("yellowpages")
  sourceUrl      String?
  externalId     String?

  // Search context
  searchQuery    String
  searchLocation String

  // Core
  businessName   String
  category       String?
  categories     String[]
  phone          String?
  phones         String[]
  fax            String?
  email          String?
  emails         String[]            // ALL emails harvested
  website        String?
  otherLinks     String[]            // additional websites from YP "Other Links"

  // Address
  address        String?
  address2       String?
  city           String?
  state          String?
  postalCode     String?
  country        String?
  latitude       Float?
  longitude      Float?

  // Profile
  description     String?            // YP "General Info"
  businessHistory String?            // YP "Business History"
  yearEstablished Int?
  neighborhoods   String[]
  rating          Float?
  reviewCount     Int?
  bbbGrade        String?
  yearsInBusiness Int?
  yearsWithYP     Int?
  claimed         Boolean
  photos          String[]
  logoUrl         String?
  bannerUrl       String?

  // Socials — flat list of every URL from YP + business website
  socials        String[]

  // Owner enrichment
  ownerName      String?
  ownerEmail     String?
  ownerPhone     String?
  ownerLinkedin  String?
  ownerSearchUrl String?              // pre-built Google query

  // Dedup
  dedupHash      String?              // sha1(name+phone+address)
  rawPayload     Json?

  createdAt      DateTime
  updatedAt      DateTime

  // Relations
  job              ScrapeJob?
  groupMemberships LeadGroupMember[]
  notes            Note[]
  emailLogs        EmailLog[]

  @@unique([source, dedupHash])      // re-scrapes update, no dupes
}
```

### email_logs (future-ready)

```prisma
model EmailLog {
  id              String      @id @default(uuid())
  leadId          String
  accountId       String?

  fromEmail       String
  fromName        String?
  toEmail         String
  cc              String[]
  bcc             String[]
  subject         String
  bodyHtml        String?
  bodyText        String?

  status          EmailStatus       // queued | sending | sent | failed
  provider        String            // gmail
  messageId       String?           // Gmail message id
  threadId        String?           // Gmail threadId — for reply detection
  trackingId      String  @unique   // for pixel + click links
  error           String?

  // Phase 4 hooks (nullable today)
  openedAt        DateTime?
  firstClickedAt  DateTime?
  repliedAt       DateTime?
  bouncedAt       DateTime?

  sentAt          DateTime?
  createdAt       DateTime

  lead    Lead          @relation(...)
  account EmailAccount? @relation(...)
}
```

---

## 4. Scraping Architecture

### How a scrape happens (live streaming)

1. User submits `POST /api/scrape-jobs` with `{ searchQuery, searchLocation }`
2. API inserts `scrape_jobs` row (status=`queued`) and adds a BullMQ job
3. `ScrapeProcessor` (in-process worker) marks `running` and spawns Python subprocess
4. Python opens Playwright Chromium, walks YP search pages
5. **For each business** (the hot loop):
   - **Pass 1**: parse YP detail page → save lead **immediately** with whatever YP gave us
   - **Pass 2**: crawl business website (footer-first, contact/about pages, Cloudflare-decoded emails) → update same lead with discovered emails + socials
6. Python emits JSON-line events on stdout (`progress`, `saved`, `done`)
7. ScrapeProcessor reads stdout and updates the job row
8. UI polls every 1s and shows rows streaming in

### YellowPages defeat strategies

YP fingerprints browsers via Cloudflare. We bypass by:

- **Fresh BrowserContext per detail page** (search→click pattern in same context strips JSON-LD)
- Realistic User-Agent, viewport, locale, timezone, `navigator.webdriver` removed
- 2.5–5.5s jitter between search pages, 0.4–1s between detail pages

### Email + Social harvest

For every lead with a website:

1. **YP detail page** — `mailto:` anchor + JSON-LD email field + regex sweep of HTML
2. **Business website** (always crawled, even if YP gave us an email)
   - Skip `*.localsearch.com` (YP-managed stub sites — never have data)
   - Wait for `networkidle` so JS-rendered emails load
   - **Footer-first** scan (most businesses put email in footer)
   - Decode **Cloudflare-obfuscated** emails (`data-cfemail` attr)
   - Follow contact-ish anchors discovered on homepage (`/contact`, `/aboutus`, `/team`, etc.)
   - Fall back to fixed paths if homepage discovers nothing
3. **Other Links** (YP "Other Links" block) — if primary website fails, try alternates

Filter: drop `noreply@`, `wixpress.com`, `yelp.com`, image-hash matches.

### Social platforms recognized

13 platforms via `classify_social()` helper. Each has alternate domains:

`facebook | linkedin | twitter (incl x.com) | instagram | youtube | tiktok | pinterest | yelp | threads | snapchat | whatsapp | telegram | github`

Share/redirect noise filtered (`/sharer`, `intent/tweet`, `l.facebook.com/l.php`, `linkedin.com/showcase/`).

### Coverage benchmarks (real LA-plumbers run)

- ~90% of leads with **real websites** get an email
- ~70% of leads have at least one social URL
- Remaining ~10% genuinely don't publish an email anywhere on their site

---

## 5. CRM Layer

### Lead listing — `GET /api/leads`

Filters supported:

| Param            | Type     | Notes                                            |
|------------------|----------|--------------------------------------------------|
| `q`              | string   | matches name, category, city, description       |
| `category`       | string   | exact match on `category` OR `categories[]`      |
| `city`, `state`  | string   | exact                                            |
| `hasWebsite`     | boolean  | `website IS NOT NULL`                            |
| `hasEmail`       | boolean  | `email IS NOT NULL`                              |
| `hasPhone`       | boolean  | `phone IS NOT NULL`                              |
| `hasSocials`     | boolean  | `array_length(socials, 1) > 0`                   |
| `claimed`        | boolean  | YP claimed badge                                 |
| `ratingMin/Max`  | float    | rating range                                     |
| `yearsMin/Max`   | int      | years_in_business range                          |
| `groupId`        | uuid     | restrict to leads in a manual group              |
| `take`, `cursor` | int/uuid | cursor pagination                                |
| `orderBy`        | enum     | recent \| name \| rating \| years                |

### Smart Groups

A smart group stores its filter as a JSON document — same shape as the query string. When `GET /api/groups/:id/leads` is called for a smart group, the service deserializes `filterDsl` and calls `LeadsService.list()`. **No separate query engine** — smart groups reuse the leads filter pipeline 1:1.

### Lead Detail page sections

1. **Header** — logo, name, claimed badge, category, address, rating, years
2. **Send email button** (primary action)
3. **Business Overview** — phone, primary email, address, lat/lng, year established, all categories, neighborhoods, description, business history
4. **Email history** — every send + status + open/reply placeholders
5. **Notes** — text notes, append + delete
6. **Activity Timeline** (placeholder for Phase 4)
7. **Contact / Owner** — owner search, all collected emails + phones
8. **Website + Social** — all URLs grouped by platform
9. **Source** — YP listing link + scrape provenance

---

## 6. Email System (Phase 3)

Built on Gmail OAuth via the official `googleapis` SDK.

### Endpoints

```
GET    /api/email/auth/connect         → 302 to Google consent
GET    /api/email/auth/callback        → exchange code, redirect to /settings
GET    /api/email/accounts             → list connected (no tokens leaked)
DELETE /api/email/accounts/:id         → revoke + delete

POST   /api/email/send                 → atomic insert(sending) → Gmail → update(sent|failed)
GET    /api/leads/:leadId/emails       → per-lead history, refetched every 5s
```

### Security

- **Refresh tokens encrypted at rest** (AES-256-GCM, 32-byte key from `EMAIL_TOKEN_ENC_KEY`)
- Access tokens auto-refreshed 60s before expiry
- OAuth state parameter for CSRF protection (`stateStore` in EmailAccountsService)

### MIME message construction

`gmail.service.ts` builds an RFC 2822 message:

- `multipart/alternative` (text + HTML) when `bodyHtml` provided
- Plain text when only `body` given
- `Subject:` is RFC 2047 encoded if non-ASCII
- All recipients stored separately (`to`, `cc`, `bcc`)

### Future-ready columns on `email_logs`

| Column            | When populated (Phase 4) |
|-------------------|---------------------------|
| `tracking_id`     | Already set (UUID per row). Phase 4: `GET /api/email/track/:trackingId.gif` returns 1×1 pixel + sets `openedAt`. |
| `thread_id`       | Already set (Gmail's threadId). Phase 4: Gmail Watch / IMAP IDLE matches incoming replies → sets `repliedAt`. |
| `firstClickedAt`  | Phase 4: outbound links rewritten through `/api/email/click/:trackingId/:linkHash` → 302 + record click. |
| `bouncedAt`       | Phase 4: SMTP bounce webhook (when we move off Gmail) or Gmail bounce notification. |

---

## 7. Roadmap

### ✅ Phase 1 — Lead Scraping MVP (shipped)

- YellowPages scraper that walks every page until empty
- Live-streaming UI (rows appear within ~2-3s of being scraped)
- Rich extraction: phone, all emails, website, full address, lat/lng, categories, hours, rating, reviews, year established, claimed flag, logo, banner, all socials
- Two-pass save (early row, later enrichment) so the user sees data immediately
- Stop / Start toggle with subprocess kill
- Polling every 1s while running

### ✅ Phase 2 — CRM Core (shipped)

- **Global Leads** with filter sidebar (typeahead category/city/state, no overflow)
- **Lead Detail page** with 6 sections including notes
- **Manual + Smart groups** — smart groups reuse the leads filter pipeline 1:1
- **Multi-select** rows → add to group / save current filter as smart group
- Column visibility toggle (persisted to localStorage)
- Per-row + bulk **delete leads**
- URL-synced filter state (shareable links)
- **Collapsible sidebar** with hamburger toggle

### ✅ Phase 3 — Email Sending MVP (shipped)

- Gmail OAuth flow (Connect / Disconnect from Settings page)
- AES-256-GCM encryption of refresh tokens at rest
- Auto access-token refresh
- **Send Email dialog** on lead detail (account picker, recipient picker incl. custom, subject, body)
- **Email history** section per lead with sent/failed status
- Future-ready columns: `tracking_id`, `thread_id`, `openedAt`, `repliedAt`, `firstClickedAt`, `bouncedAt`

### ⏭ Phase 4 — Tracking & Activity (next)

- **Open tracking** — 1×1 pixel endpoint hits set `openedAt`
- **Click tracking** — outbound links rewritten through redirector
- **Reply detection** — Gmail Watch / IMAP IDLE listener sets `repliedAt`
- **Activity Timeline** — unified feed of: scraped, email sent, email opened, replied, note added, group added
- **Notifications** — in-app bell icon when leads reply

### ⏭ Phase 5 — Outreach at Scale

- Email **sequences** (drip campaigns: Day 0 / Day 3 / Day 7 if no reply)
- **Templates** with merge tags (`{{businessName}}`, `{{ownerFirstName}}`)
- **Send from a group** action (bulk send w/ rate limiting)
- Per-account daily send caps (Gmail limit awareness)
- Suppression list (don't send to bounced or unsubscribed)

### ⏭ Phase 6 — Automation Workflows

- JSON rule engine (already designed in original architecture):
  - Trigger: any event (`lead.created`, `email.opened`, `email.replied`, `task.overdue`, `time.elapsed`)
  - Conditions: filter expressions on lead fields
  - Actions: update lead, create task, send email, add to group, branch, wait
- UI to build workflows visually
- Workflow execution log (`workflow_runs` table)

### ⏭ Phase 7 — Multi-tenant SaaS

- Tenants, users, RBAC
- `tenant_id` on every row + Postgres RLS as defense-in-depth
- Per-tenant Gmail accounts (currently shared)
- Billing integration (Stripe)
- Audit log for compliance

### ⏭ Phase 8 — Owner Discovery

Per `docs/OWNER_DISCOVERY.md`:

- Layer 1 (free): scrape `/about`, `/team`, `/contact` for `Name, Title` patterns
- Layer 2 (free): state Secretary-of-State filings (CA, DE, NY, TX) by entity name → officers
- Layer 3 ($49–99/mo): Hunter.io domain-search → owner email + name + confidence
- Layer 4 ($50/mo selective): Lusha for owner phone

Estimated cost at 10k leads/mo with verified owner email on ~30%: ~$150/mo total.

---

## 8. Operations

### Local dev (no Docker required)

```bash
./scripts/dev.sh
```

Starts Postgres + Redis (user-mode) and `pnpm dev` (turbo runs API + Web in parallel).

If you don't have Postgres/Redis locally, see `docs/SETUP_NO_DOCKER.md` — uses portable binaries from Zonky + redis built from source.

### Environment variables

See `.env.example`. Critical ones:

```
DATABASE_URL=postgresql://onspace:onspace@localhost:5432/onspace_crm
REDIS_HOST=localhost
REDIS_PORT=6379
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/email/auth/callback
EMAIL_TOKEN_ENC_KEY=<32+ char string for refresh-token encryption>
```

### Running just the scraper standalone

```bash
cd apps/scraper
DATABASE_URL=... .venv/bin/python -m scraper.main \
  --job-id <uuid> --query "plumber" --location "Los Angeles, CA"
```

### Running migrations

```bash
pnpm --filter @onspace/db prisma:migrate
```

Migrations to date:

```
20260501_init                      → initial schema (leads + scrape_jobs)
20260501_rich_lead_fields          → claimed, hours, year, services, etc.
20260501_slim_lead                 → drop services/brands/payment/languages/reviews/hours
20260501_socials_list              → social: dict → flat list
20260502_groups_and_notes          → groups, group members, notes
20260502_email_sending             → email_accounts, email_logs
```

---

## 9. Design System

**"Crypto Blue"** — fintech-grade design system optimized for data-dense screens.

| Token        | Value                                |
|--------------|--------------------------------------|
| Primary      | `#0052FF` (Coinbase blue)            |
| Success      | `#05B169`                            |
| Warning      | `#F0AD4E`                            |
| Error        | `#DF2935`                            |
| Background   | `#F9FAFB`                            |
| Surface      | `#FFFFFF`                            |
| Border       | `#D1D5DB`                            |
| Text         | `#050F1A` (primary), `#5B616E` (muted)|
| Display font | Inter                                |
| Mono / data  | JetBrains Mono (tabular numerals)    |
| Border radius| 4 / 8 / 12 / 16 / pill              |
| Elevation    | 0 / 1 (subtle) / 2 (popover) / 3 (modal) |

All tokens live in `apps/web/tailwind.config.ts`.

---

## 10. What's Intentionally Simplified (vs the full architecture spec)

| Future / full | Phase 1-3 reality |
|---|---|
| Microservices for scraping / campaigns / workflows | Single NestJS monolith with feature modules |
| Kafka event bus | Direct service calls + BullMQ for scraping jobs |
| ClickHouse for email events | Postgres for everything |
| Elasticsearch / Meilisearch | `pg_trgm` + GIN index on `to_tsvector` |
| Multi-tenant + RBAC | Single workspace, no auth |
| Activity timeline (calls / emails / meetings / tasks) | Just notes + email history; placeholder activity card |
| Workflow rule engine | Not built — Phase 6 |
| Email open / click / reply tracking | DB columns exist; pixel + IMAP listener is Phase 4 |
| Email campaigns / sequences | Phase 5 |
| Owner discovery automation | Phase 8 (manual Google search URL pre-built today) |
| Proxy rotation pool | Single optional `SCRAPER_PROXY_URL` |
| AI-drafted email bodies | Phase 5+ |

These are **deliberate** simplifications for MVP speed. Each can be added without rewrites because the boundaries (modules, schema, queue) were designed to admit them later.

---

## 11. Notable Decisions & Why

| Decision | Why |
|---|---|
| Two-process design (Node + Python) | Each language used where it dominates. Node for transactional CRM APIs; Python for headless browser scraping. |
| Modular monolith first | Premature microservices = premature complexity. Module boundaries make extraction trivial later. |
| Postgres for everything in MVP | One database to operate. Add specialized stores (ClickHouse/ES) only when measured pain. |
| Idempotent scrapes | `(source, dedup_hash) UNIQUE` + `INSERT … ON CONFLICT DO UPDATE`. Re-scraping enriches, never duplicates. |
| Outbox-style 2-pass save | Row appears in UI within ~2-3s; slow website crawl updates the same row 10-15s later. |
| Direct DB writes from Python | Avoids HTTP round-trip per lead. Python connects to Postgres via `psycopg`. |
| Refresh tokens encrypted at rest | AES-256-GCM. Even if DB leaks, attacker can't replay OAuth without `EMAIL_TOKEN_ENC_KEY`. |
| Smart groups reuse leads filter pipeline | No second query engine. `filterDsl` is the same JSON shape as `/leads` query params. |
| URL-synced filter state | Shareable links, browser back/forward, deep-linkable smart group views. |
| Cursor pagination | Predictable performance on large tables. No `OFFSET`. |

---

## 12. Glossary

| Term                | Meaning                                                          |
|---------------------|------------------------------------------------------------------|
| **Lead**            | A scraped business record. ~50 fields including contact details. |
| **Scrape job**      | One run of "scrape category + location". Tracked in `scrape_jobs`. |
| **Manual group**    | A bag of lead IDs the user explicitly added.                     |
| **Smart group**     | A saved query (filter JSON). Members are computed at read time.  |
| **Tracking ID**     | UUID per email log used for pixel/click tracking (Phase 4).      |
| **Stub site**       | YP-managed `*.localsearch.com` page — no real contact info, skipped during website crawl. |
| **Live activity strip** | Pulsing banner on Lead Scraper page showing last-saved business name + polling cadence. |

---

_Last updated: 2026-05-02 — after Phase 3 (Gmail email sending)._
