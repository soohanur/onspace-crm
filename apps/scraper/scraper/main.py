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

from .db import get_conn, upsert_lead
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


HARD_PAGE_LIMIT = 100  # safety: YP rarely shows more than ~50 pages


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

            page_n = 1
            while page_n <= HARD_PAGE_LIMIT:
                url = search_url(args.query, args.location, page_n)
                emit("info", message=f"page {page_n}: {url}")
                try:
                    await goto(search_page, url)
                except Exception as e:
                    emit("warn", message=f"search page {page_n} failed: {e}")
                    break

                page_listings = await parse_search_page(search_page)
                if not page_listings:
                    emit("info", message=f"page {page_n} empty — stopping")
                    break

                for listing in page_listings:
                    found += 1
                    emit("progress", totalFound=found)

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

                    # PASS 1: save the lead immediately with whatever YP gave us
                    # (name, phone, address, website, rating, hours, etc). The
                    # frontend table sees the row appear within a couple of
                    # seconds — no waiting on the slower website crawl.
                    if save_now():
                        saved += 1
                    emit("saved", totalSaved=saved)

                    # PASS 2: enrich from the business website (slower) and
                    # update the same row with discovered emails + socials.
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
                            if listing.email and listing.socials:
                                break
                        except Exception as e:
                            emit("warn", message=f"website harvest failed for {site_url}: {e}")

                    if enriched:
                        save_now()  # update — same dedup_hash, returns False (not newly inserted)

                    try:
                        await detail_ctx.close()
                    except Exception:
                        pass

                    await asyncio.sleep(random.uniform(0.4, 1.0))

                # polite pause between search pages
                await asyncio.sleep(random.uniform(2.0, 4.5))
                page_n += 1
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
    args = parser.parse_args()

    try:
        rc = asyncio.run(run(args))
    except Exception:
        emit("error", message=traceback.format_exc())
        rc = 1
    sys.exit(rc)


if __name__ == "__main__":
    main()
