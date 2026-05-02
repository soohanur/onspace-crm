# Owner Discovery — realistic plan for Phase 2

YellowPages doesn't expose owner info. To reliably get **owner name + email + phone + LinkedIn**, we need a layered pipeline of free signals + cheap paid APIs. Here's a feasible build, ordered by yield-per-dollar.

## What we already have for free (right now)

- Business name, full website URL, business email (when listed), phone, address
- Pre-built Google search query: `site:linkedin.com/in "{Business}" (owner OR founder OR CEO OR president)` — already stored in `lead.ownerSearchUrl`. One click and you usually find them.

## The four-layer pipeline I recommend

### Layer 1 — Free, always run

**a. Scrape the business website's About / Team / Contact pages**
We already harvest `mailto:` and emails from `/contact`, `/about`, `/team`, etc. **Extension**: when we hit those pages, also extract name patterns near titles. Heuristics that work:
- Regex `([A-Z][a-z]+ [A-Z][a-z]+),?\s*(Owner|Founder|CEO|President|Principal|Managing Partner|Director)` against page text
- Look for "About the owner", "Meet our founder", "Our team" sections
- Schema.org `Person` JSON-LD blocks on About pages
- Image alt text often has names ("Photo of John Smith")

Yield: ~30-40% of small businesses have the owner named on their website.

**b. State business registry filings**
Every US state's Secretary of State publishes the registered agent + officers/managers of any LLC or Corp. **Free, public, no API key**.
- California: `https://bizfileonline.sos.ca.gov/search/business` — searchable by entity name, returns officers
- Delaware: `https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx`
- Texas: `https://mycpa.cpa.state.tx.us/coa/`
- New York: `https://apps.dos.ny.gov/publicInquiry/`

Strategy: state lookup keyed on `business_name + state`. Returns owner name(s). Yield ~70-80% for incorporated businesses; useless for sole proprietors.

**c. Google "Knowledge Panel" parsing**
Searching `"{Business Name} {City}" owner` often surfaces a Google Business Profile or a press article naming the owner in the snippet. Cheap to parse a Google SERP HTML page (rate-limit carefully or use SerpApi at $50/mo for 5000 searches).

**d. BBB profile**
For businesses with a BBB listing (`bbb.org/us/...`), the "Business Details" tab usually names principals/contacts. Free to scrape.

### Layer 2 — Paid email finder ($49–99/mo, biggest single yield)

**Hunter.io** is the cheapest mature option:
- `GET /v2/domain-search?domain={domain}` returns up to 10 emails per company with **first/last name + title + confidence score**. We pick the one whose title matches `owner|founder|ceo|president|principal`.
- $49/mo = 500 searches; $99/mo = 2500.

Alternative tools at the same price band: **Snov.io**, **Apollo.io** (Apollo's free tier gives 50 credits/mo — useful for testing).

For our scraper: when we have a `website` domain, call `Hunter.domain-search(domain)`. If it returns a `position` matching owner/founder, set `lead.owner_name`, `lead.owner_email`. Confidence below 70 → mark as "unverified".

Yield: **~50-60% of leads with a real domain** get a verified owner email this way. For chains (Roto-Rooter franchises), it'll return corporate emails not the local owner — that's OK, we mark them low-confidence.

### Layer 3 — LinkedIn (the hard one)

**Don't try to scrape LinkedIn directly.** They block aggressively and the ToS exposes you legally.

Three legitimate paths:

**a. LinkedIn Sales Navigator API** — official, expensive (only available with seat + Sales Solutions agreement, ~$80/seat/mo), but the API permits 500 person searches/day per user.

**b. Pipl / Lusha / RocketReach / ContactOut** — third-party providers with LinkedIn data licensed in. Lusha's API is $50/mo for 50 credits but each credit gives full contact (name + email + phone + LinkedIn).

**c. Just keep using the Google search URL we generate.** Honestly, for an MVP one click is fine — the user clicks and gets a real LinkedIn profile. We don't pay anything. We can later upgrade specific leads to paid lookups when the user marks them as "high priority".

### Layer 4 — Phone numbers

Owner phone is the hardest. Realistic options:

- **Lusha / RocketReach** as above — they often have direct dial.
- **Nymeria** ($79/mo, 100 credits) — specifically people-search with phone.
- **People Data Labs API** — bulk B2B data, gives phone for ~30% of records.
- **SignalHire**, **ZoomInfo** — enterprise, $$$$.

For Phase 2 MVP, **skip owner phone**. The business phone is on YP and that's good enough to call and ask.

## Recommended Phase 2 implementation plan

```
For each lead with a `website` domain:
  1. (free) Walk About / Team / Contact pages → regex Names + titles
  2. (free) Look up state registry by (business_name, state) → officers
  3. (paid, optional) Hunter.io domain-search → owner email + name
  4. (free) Build Google search URL → user clicks for LinkedIn

If owner_name is found in step 1 or 2 + website domain known:
  5. (paid, optional) Hunter email-finder(first, last, domain) → owner_email
```

Schema additions for Phase 2:
```prisma
model Lead {
  // ...
  ownerConfidence  Int?       // 0-100
  ownerSource      String?    // 'website' | 'state_registry' | 'hunter' | 'manual'
  ownerVerified    Boolean    @default(false)
  ownerLastChecked DateTime?
  // already have: ownerName, ownerEmail, ownerPhone, ownerLinkedin
}
```

UI:
- Add a single button in the lead row: **"Find owner"** (opens a modal that shows what we know + the Google/LinkedIn search link).
- If a lead has `ownerEmail`, show a confidence chip (green ≥80, yellow 50-80, red <50).
- "Verify owner" button → triggers the layer 1+2+3 pipeline for that one lead, costs Hunter credits if enabled.

## Cost ballpark for 10k leads/month

| Layer | Cost | Coverage |
|---|---|---|
| 1. Website + state registry + BBB scrape | $0 | ~50% get a name |
| 2. Hunter.io domain-search | ~$99/mo | ~60% of those get a verified email |
| 3. LinkedIn (Google SERP click) | $0 | manual; user-driven |
| 4. Phone (Lusha selective) | $50/mo for top 50 priority leads | as needed |

**Total for 10k leads/mo with verified owner email on ~30% of them: ~$150/mo.**

This is the same approach Apollo / ZoomInfo / Clearbit use under the hood — you're just buying access to one layer (Hunter) instead of paying $5k+/mo for a full enterprise database.
