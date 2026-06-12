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

from .db import email_exists, get_conn, lead_exists, upsert_lead
from .email_validate import first_valid_email, is_valid_email
from .dedup import dedup_hash, normalize_phone
from .event import emit
from .website import harvest_from_website, guess_owner_linkedin_search_url
from .yellowpages import (
    enrich_from_detail,
    get_next_search_url,
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
        # YP fingerprints contexts: once a context has loaded a search
        # results page, subsequent navigations in the same context (to
        # page 2, page 3, …) return a sparse / empty DOM. Diagnostic
        # confirmed page 2 parses 30 listings in a FRESH context but 0
        # in a reused one. So we tear down + re-create the search
        # context per page. Costs ~300ms per page; reliably gets full
        # listing data on every page.
        search_ctx = None
        try:
            page_n = max(1, int(getattr(args, "start_page", 1) or 1))
            if page_n > 1:
                emit("info", message=f"resuming at page {page_n}")
            # First-page URL is constructed; from page 2 on we follow YP's
            # actual "Next" pagination link, which is more reliable than
            # guessing query-string variants the site might A/B-test.
            target_url = search_url(args.query, args.location, page_n)
            while page_n <= HARD_PAGE_LIMIT:
                # Fresh context per search page — defeats YP fingerprint.
                if search_ctx is not None:
                    try:
                        await search_ctx.close()
                    except Exception:
                        pass
                search_ctx = await make_context(browser)
                search_page = await search_ctx.new_page()

                emit("info", message=f"page {page_n}: {target_url}")
                try:
                    await goto(search_page, target_url)
                except Exception as e:
                    emit("warn", message=f"search page {page_n} failed: {e}")
                    raise

                page_listings = await parse_search_page(search_page)
                emit(
                    "info",
                    message=f"page {page_n}: parsed {len(page_listings)} listings",
                )
                if not page_listings:
                    # Diagnostic dump so the user can see WHY the page
                    # parsed empty: what URL did we land on, what was
                    # the title, and is the "no results" banner there.
                    try:
                        final_url = search_page.url
                    except Exception:
                        final_url = target_url
                    try:
                        title = await search_page.title()
                    except Exception:
                        title = "?"
                    try:
                        no_results_visible = (
                            await search_page.query_selector(
                                "div.no-results, h1.no-results-title",
                            )
                        ) is not None
                    except Exception:
                        no_results_visible = False
                    emit(
                        "info",
                        message=(
                            f"page {page_n} empty — final_url={final_url} "
                            f"title='{title}' no_results_banner={no_results_visible}"
                        ),
                    )
                    emit("exhausted")
                    break

                page_skipped = 0
                page_saved_count = 0
                page_dropped = 0
                page_errors = 0
                for listing in page_listings:
                    found += 1
                    emit("progress", totalFound=found)
                    try:
                        # Pre-fetch dedup: if we already have this YP MIPID
                        # or detail URL in `leads`, skip the slow detail +
                        # website crawl entirely. Re-running the same query
                        # never re-scrapes a company we already harvested.
                        if lead_exists(
                            conn,
                            source="yellowpages",
                            external_id=listing.external_id,
                            source_url=listing.detail_url,
                        ):
                            page_skipped += 1
                            emit(
                                "info",
                                message=f"skip already-saved: {listing.business_name}",
                            )
                            continue
                    except Exception as e:
                        page_errors += 1
                        emit(
                            "warn",
                            message=f"listing pre-check failed for {getattr(listing, 'business_name', '?')}: {e}",
                        )
                        continue

                    # Per-listing work wrapped so any failure (network,
                    # parse, DB) drops just this listing — page walk
                    # continues to the next listing + next page.
                    detail_ctx = None
                    try:
                        detail_ctx = await make_context(browser)
                        detail_page = await detail_ctx.new_page()
                        try:
                            await enrich_from_detail(detail_page, listing)
                        except Exception as e:
                            emit(
                                "warn",
                                message=f"detail failed for {listing.business_name}: {e}",
                            )

                        owner_search_url = guess_owner_linkedin_search_url(
                            listing.business_name
                        )

                        def save_now() -> bool:
                            """Idempotent upsert — first call inserts, later calls update."""
                            dh = dedup_hash(
                                listing.business_name, listing.phone, listing.address
                            )
                            phone_norm = (
                                normalize_phone(listing.phone) or listing.phone
                            )
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

                        site_urls = []
                        if listing.website:
                            site_urls.append(listing.website)
                        for u in listing.other_links or []:
                            if u and u not in site_urls:
                                site_urls.append(u)

                        for site_url in site_urls:
                            try:
                                info = await harvest_from_website(detail_ctx, site_url)
                                site_email = info.get("email")
                                if site_email and not listing.email:
                                    listing.email = site_email  # type: ignore[assignment]
                                for em in (info.get("all_emails") or []):  # type: ignore[union-attr]
                                    if em not in listing.emails:
                                        listing.emails.append(em)
                                for url in (info.get("socials") or []):  # type: ignore[union-attr]
                                    if url not in listing.socials:
                                        listing.socials.append(url)
                                site_phones = info.get("phones") or []  # type: ignore[union-attr]
                                for ph in site_phones:
                                    if ph and ph not in listing.phones:
                                        listing.phones.append(ph)
                                if not listing.phone and site_phones:
                                    listing.phone = site_phones[0]  # type: ignore[assignment]
                                if listing.email and listing.socials and listing.phone:
                                    break
                            except Exception as e:
                                emit(
                                    "warn",
                                    message=f"website harvest failed for {site_url}: {e}",
                                )

                        # Email-only policy. The outreach engine sends
                        # cold drips by email; a listing with no email
                        # is dead weight and is dropped before save.
                        candidate_emails = list(
                            filter(
                                None,
                                [listing.email] + list(listing.emails or []),
                            )
                        )
                        if not candidate_emails:
                            page_dropped += 1
                            emit(
                                "info",
                                message=f"skip no-email: {listing.business_name}",
                            )
                            continue

                        # Pre-save validation (syntax + disposable + MX).
                        # Conservative: DNS transient errors KEEP the
                        # candidate. The bounce-handler is the final
                        # filter post-send.
                        good_email = first_valid_email(candidate_emails)
                        if not good_email:
                            page_dropped += 1
                            emit(
                                "info",
                                message=f"skip invalid-email: {listing.business_name} ({candidate_emails[0]})",
                            )
                            continue

                        # Promote the validated address to primary so the
                        # outreach engine targets a clean recipient.
                        listing.email = good_email
                        # Also filter the array to only-valid emails.
                        listing.emails = [
                            e for e in candidate_emails if is_valid_email(e)
                        ]

                        # Email-dedup. Same operator commonly lists
                        # multiple business names in YP behind one
                        # contact email — skipping these stops the
                        # outreach sequence from hammering the same
                        # mailbox three times.
                        if email_exists(conn, [good_email]):
                            page_dropped += 1
                            emit(
                                "info",
                                message=f"skip dup-email: {listing.business_name} ({good_email})",
                            )
                        elif save_now():
                            saved += 1
                            page_saved_count += 1
                            emit("saved", totalSaved=saved)
                        else:
                            emit("saved", totalSaved=saved)
                    except Exception as e:
                        page_errors += 1
                        emit(
                            "warn",
                            message=f"listing failed: {getattr(listing, 'business_name', '?')}: {e}",
                        )
                    finally:
                        if detail_ctx is not None:
                            try:
                                await detail_ctx.close()
                            except Exception:
                                pass

                    await asyncio.sleep(random.uniform(0.4, 1.0))

                # Page fully committed — emit summary + persist cursor so
                # a crash on the NEXT page can resume here.
                emit(
                    "info",
                    message=(
                        f"page {page_n} done: "
                        f"parsed={len(page_listings)} "
                        f"saved={page_saved_count} "
                        f"skipped_dup={page_skipped} "
                        f"dropped_no_contact={page_dropped} "
                        f"errors={page_errors}"
                    ),
                )
                emit("page_done", page=page_n)

                # Follow YP's actual "Next" link instead of guessing the
                # URL — covers query-string variants the site A/B-tests.
                # If the page has no next link, we're truly exhausted.
                try:
                    next_url = await get_next_search_url(search_page)
                except Exception as e:
                    emit(
                        "warn",
                        message=f"next-link lookup failed on page {page_n}: {e}",
                    )
                    next_url = None
                if not next_url:
                    # Fallback: construct page_n+1 URL in case the next
                    # link selectors all missed but YP still paginates.
                    constructed = search_url(args.query, args.location, page_n + 1)
                    emit(
                        "info",
                        message=(
                            f"page {page_n}: no next-link found — "
                            f"trying constructed url {constructed}"
                        ),
                    )
                    target_url = constructed
                else:
                    target_url = next_url

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
