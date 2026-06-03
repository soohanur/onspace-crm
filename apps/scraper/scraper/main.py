"""CLI entrypoint invoked by NestJS BullMQ worker.

Live-streaming flow: instead of collecting all listings then enriching them in
two phases, we walk a search page → enrich each listing on a detail page →
harvest its website → write to DB → move on. This way the UI sees rows trickle
in as they complete, and a partial scrape (e.g. 403 mid-run) still saves what
it got.

Stdout protocol:
    {"type":"progress","totalFound":N}
    {"type":"saved","totalSaved":N}
    {"type":"warn","message":"..."}
    {"type":"done","totalFound":N,"totalSaved":N}
"""
from __future__ import annotations

import argparse
import asyncio
import os
import random
import sys
import traceback

from playwright.async_api import async_playwright

from .db import get_conn, lead_exists, upsert_lead
from .dedup import dedup_hash, normalize_phone
from .event import emit
from .website import harvest_from_website, guess_owner_linkedin_search_url
from .yellowpages import (
    enrich_from_detail,
    listing_to_dict,
    make_browser,
    make_context,
    parse_search_page,
    search_url,
    goto,
)


# Hard ceiling so a buggy YP pagination loop can't spin forever. 10k pages
# at ~30 listings/page = 300k results — far past any real category.
HARD_PAGE_LIMIT = 10_000


async def run(args: argparse.Namespace) -> int:
    conn = get_conn()
    saved = 0
    found = 0

    proxy = os.environ.get("SCRAPER_PROXY_URL") or None
    headful_env = os.environ.get("SCRAPER_HEADFUL", "false").lower()
    headful = headful_env in ("1", "true", "yes")

    async with async_playwright() as p:
        browser = await make_browser(p, proxy=proxy, headful=headful)
        # YP fingerprints contexts: after the search page is visited, follow-on
        # detail navigations in the same context get stripped JSON-LD. We use a
        # dedicated context for the search loop, and create a *fresh* context
        # per detail page visit. Costs an extra ~200ms per lead but reliably
        # gets the full structured data.
        search_ctx = await make_context(browser)
        try:
            search_page = await search_ctx.new_page()

            page_n = max(1, int(getattr(args, "start_page", 1) or 1))
            if page_n > 1:
                emit("info", message=f"resuming at page {page_n}")
            while page_n <= HARD_PAGE_LIMIT:
                url = search_url(args.query, args.location, page_n)
                emit("info", message=f"page {page_n}: {url}")
                try:
                    await goto(search_page, url)
                except Exception as e:
                    # Re-raise so the BullMQ worker sees a failure and the
                    # retry kicks in from the next page (last_page stays at
                    # page_n - 1 — committed at end of prior page).
                    emit("warn", message=f"search page {page_n} failed: {e}")
                    raise

                page_listings = await parse_search_page(search_page)
                if not page_listings:
                    emit("info", message=f"page {page_n} empty — stopping")
                    emit("exhausted")
                    break

                for listing in page_listings:
                    found += 1
                    emit("progress", totalFound=found)

                    # Pre-fetch dedup: if we already have this YP MIPID or
                    # detail URL in `leads`, skip the slow detail + website
                    # crawl entirely. Re-running the same query never
                    # re-scrapes a company we already harvested.
                    if lead_exists(
                        conn,
                        source="yellowpages",
                        external_id=listing.external_id,
                        source_url=listing.detail_url,
                    ):
                        emit(
                            "info",
                            message=f"skip already-saved: {listing.business_name}",
                        )
                        continue

                    # Fresh context per detail page — defeats YP fingerprint.
                    detail_ctx = await make_context(browser)
                    detail_page = await detail_ctx.new_page()
                    try:
                        await enrich_from_detail(detail_page, listing)
                    except Exception as e:
                        emit("warn", message=f"detail failed for {listing.business_name}: {e}")

                    owner_search_url = guess_owner_linkedin_search_url(
                        listing.business_name
                    )

                    def save_now() -> bool:
                        """Idempotent upsert — first call inserts, later calls update."""
                        dh = dedup_hash(
                            listing.business_name, listing.phone, listing.address
                        )
                        phone_norm = normalize_phone(listing.phone) or listing.phone
                        return upsert_lead(
                            conn,
                            job_id=args.job_id,
                            source_url=listing.detail_url,
                            external_id=listing.external_id,
                            search_query=args.query,
                            search_location=args.location,
                            business_name=listing.business_name,
                            category=listing.category,
                            categories=listing.categories,
                            phone=phone_norm,
                            phones=listing.phones,
                            fax=listing.fax,
                            email=listing.email,
                            emails=listing.emails,
                            website=listing.website,
                            other_links=listing.other_links,
                            address=listing.address,
                            address2=listing.address2,
                            city=listing.city,
                            state=listing.state,
                            postal_code=listing.postal_code,
                            country="US",
                            latitude=listing.latitude,
                            longitude=listing.longitude,
                            description=listing.description,
                            business_history=listing.business_history,
                            year_established=listing.year_established,
                            neighborhoods=listing.neighborhoods,
                            rating=listing.rating,
                            review_count=listing.review_count,
                            bbb_grade=listing.bbb_grade,
                            years_in_business=listing.years_in_business,
                            years_with_yp=listing.years_with_yp,
                            claimed=listing.claimed,
                            photos=listing.photos,
                            logo_url=listing.logo_url,
                            banner_url=listing.banner_url,
                            socials=listing.socials,
                            owner_name=None,
                            owner_email=None,
                            owner_phone=None,
                            owner_linkedin=None,
                            owner_search_url=owner_search_url,
                            raw_payload=listing_to_dict(listing),
                            dedup_hash=dh,
                        )

                    # Enrich from the business website to maximize email +
                    # phone discovery before we decide whether to save. A
                    # row is committed only if we have at least one phone
                    # or one email — no-contact leads are worthless for
                    # outreach and only pollute the table.
                    site_urls = []
                    if listing.website:
                        site_urls.append(listing.website)
                    for u in listing.other_links or []:
                        if u and u not in site_urls:
                            site_urls.append(u)

                    enriched = False
                    for site_url in site_urls:
                        try:
                            info = await harvest_from_website(detail_ctx, site_url)
                            site_email = info.get("email")
                            if site_email and not listing.email:
                                listing.email = site_email  # type: ignore[assignment]
                                enriched = True
                            for em in (info.get("all_emails") or []):  # type: ignore[union-attr]
                                if em not in listing.emails:
                                    listing.emails.append(em)
                                    enriched = True
                            for url in (info.get("socials") or []):  # type: ignore[union-attr]
                                if url not in listing.socials:
                                    listing.socials.append(url)
                                    enriched = True
                            # Phone numbers harvested from the business
                            # website (tel: anchors + footer regex) are
                            # appended to the listing — first one becomes
                            # the primary if YP didn't give us one.
                            site_phones = info.get("phones") or []  # type: ignore[union-attr]
                            for ph in site_phones:
                                if ph and ph not in listing.phones:
                                    listing.phones.append(ph)
                                    enriched = True
                            if not listing.phone and site_phones:
                                listing.phone = site_phones[0]  # type: ignore[assignment]
                                enriched = True
                            if listing.email and listing.socials and listing.phone:
                                break
                        except Exception as e:
                            emit("warn", message=f"website harvest failed for {site_url}: {e}")

                    # Validation: drop rows without a single phone or email
                    # after the website pass. These are dead-ends for any
                    # outreach pipeline and just inflate counts.
                    has_contact = bool(
                        (listing.email and listing.email.strip())
                        or (listing.phone and listing.phone.strip())
                        or any((e or "").strip() for e in (listing.emails or []))
                        or any((p or "").strip() for p in (listing.phones or []))
                    )
                    if not has_contact:
                        emit(
                            "info",
                            message=f"skip no-contact: {listing.business_name}",
                        )
                    else:
                        # Single save call — committed once per listing.
                        if save_now():
                            saved += 1
                        emit("saved", totalSaved=saved)

                    try:
                        await detail_ctx.close()
                    except Exception:
                        pass

                    await asyncio.sleep(random.uniform(0.4, 1.0))

                # Page fully committed — persist the cursor so a crash on
                # the NEXT page can resume here.
                emit("page_done", page=page_n)

                # polite pause between search pages
                await asyncio.sleep(random.uniform(2.0, 4.5))
                page_n += 1
            else:
                # Hit the safety ceiling. Don't mark exhausted — a retry can
                # legitimately keep going if the user bumps the cap.
                emit("warn", message=f"hit HARD_PAGE_LIMIT={HARD_PAGE_LIMIT}")
        finally:
            try:
                await search_ctx.close()
            except Exception:
                pass
            try:
                await browser.close()
            except Exception:
                pass
            conn.close()

    emit("done", totalFound=found, totalSaved=saved)
    return 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--query", required=True)
    parser.add_argument("--location", required=True)
    parser.add_argument(
        "--start-page",
        type=int,
        default=1,
        help="Resume cursor: search page to start from (1-indexed).",
    )
    args = parser.parse_args()

    try:
        rc = asyncio.run(run(args))
    except Exception:
        emit("error", message=traceback.format_exc())
        rc = 1
    sys.exit(rc)


if __name__ == "__main__":
    main()
