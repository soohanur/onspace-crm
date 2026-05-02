"""YellowPages scraping — comprehensive field extraction.

Detail-page structure (verified live on Ritz Plumbing, LA):

  • One <dl> contains every "More Info" field. Identify each pair by the
    <dd> class — labels in <dt> are i18n-able, classes are stable:
        dd.general-info       → description
        dd.description        → business history
        dd.features-services  → services list (comma-separated)
        dd.brands             → brands
        dd.payment            → payment methods
        dd.neighborhoods      → neighborhoods
        dd.languages          → languages
        dd.weblinks           → "Other Links" — additional URLs
        dd.categories         → full categories (longer than search-card list)
        dd.logo               → logo image
        dd.banner-ad          → banner image
        dd.social-links       → social icons
        dd (no class) under dt:Email   → mailto for primary email

  • Top-of-page badges:
        .years-in-business    → "95 Years\\nin Business"
        .years-with-yp        → "13 Years with\\nYellow Pages"
        .claim-info / [class*="claim"]  → claimed flag

  • Reviews: paired blocks of `.review-info` + `.review-response` +
    `.review-dates` (no single wrapper class).

  • JSON-LD remains the primary source for: name, telephone, address,
    geo (lat/lng), aggregateRating, openingHours, image. We use it first,
    then fill missing fields from the dl.

Anti-bot: a fresh BrowserContext per detail page reliably bypasses YP's
"after search → click result" fingerprint that strips JSON-LD.
"""
from __future__ import annotations

import asyncio
import json
import random
import re
from dataclasses import dataclass, field, asdict
from typing import Any, Optional
from urllib.parse import urlencode

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    TimeoutError as PWTimeout,
)


YP_BASE = "https://www.yellowpages.com"


@dataclass
class YPListing:
    business_name: str
    detail_url: str
    external_id: Optional[str] = None
    category: Optional[str] = None
    categories: list[str] = field(default_factory=list)
    phone: Optional[str] = None
    phones: list[str] = field(default_factory=list)
    fax: Optional[str] = None
    email: Optional[str] = None
    emails: list[str] = field(default_factory=list)
    website: Optional[str] = None
    other_links: list[str] = field(default_factory=list)
    address: Optional[str] = None
    address2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    business_history: Optional[str] = None
    year_established: Optional[int] = None
    years_in_business: Optional[int] = None
    years_with_yp: Optional[int] = None
    claimed: bool = False
    neighborhoods: list[str] = field(default_factory=list)
    rating: Optional[float] = None
    review_count: Optional[int] = None
    bbb_grade: Optional[str] = None
    photos: list[str] = field(default_factory=list)
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    socials: list[str] = field(default_factory=list)  # all unique social URLs
    raw: dict[str, Any] = field(default_factory=dict)


def search_url(query: str, location: str, page: int) -> str:
    qs = urlencode({"search_terms": query, "geo_location_terms": location, "page": page})
    return f"{YP_BASE}/search?{qs}"


_USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]


async def make_browser(p: Any, *, proxy: str | None, headful: bool) -> Browser:
    launch_args: dict[str, Any] = {
        "headless": not headful,
        "args": [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
        ],
    }
    if proxy:
        launch_args["proxy"] = {"server": proxy}
    return await p.chromium.launch(**launch_args)


async def make_context(browser: Browser) -> BrowserContext:
    ctx = await browser.new_context(
        user_agent=random.choice(_USER_AGENTS),
        viewport={"width": 1366, "height": 800},
        locale="en-US",
        timezone_id="America/New_York",
        extra_http_headers={
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    await ctx.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
    )
    return ctx


async def goto(page: Page, url: str, *, timeout: int = 30_000) -> None:
    await page.goto(url, wait_until="domcontentloaded", timeout=timeout)


_EXTID_RE = re.compile(r"-(\d+)(?:[/?]|$)")


def _extract_external_id(url: str) -> Optional[str]:
    m = _EXTID_RE.search(url)
    return m.group(1) if m else None


def _split_csv(s: Optional[str]) -> list[str]:
    if not s:
        return []
    parts = re.split(r",|;|\n", s)
    return [p.strip() for p in parts if p.strip()]


def _parse_int(s: Optional[str]) -> Optional[int]:
    if not s:
        return None
    m = re.search(r"\d+", s)
    return int(m.group(0)) if m else None


# Platforms we recognize on a business website / listing page.
SOCIAL_DOMAINS: list[tuple[str, list[str]]] = [
    ("facebook", ["facebook.com", "fb.com", "fb.me"]),
    ("linkedin", ["linkedin.com"]),
    ("twitter",  ["twitter.com", "x.com"]),
    ("instagram", ["instagram.com", "instagr.am"]),
    ("youtube",  ["youtube.com", "youtu.be"]),
    ("tiktok",   ["tiktok.com"]),
    ("pinterest", ["pinterest.com", "pinterest.co"]),
    ("yelp",     ["yelp.com", "yelp.to"]),
    ("threads",  ["threads.net"]),
    ("snapchat", ["snapchat.com"]),
    ("whatsapp", ["wa.me", "whatsapp.com"]),
    ("telegram", ["t.me", "telegram.me"]),
    ("github",   ["github.com"]),
]


def classify_social(href: str) -> Optional[str]:
    """Return the social platform key for an href, or None if not a social URL."""
    if not href:
        return None
    h = href.lower()
    # Skip share / intent / redirect links — these aren't the business's own profile.
    if any(
        bad in h for bad in (
            "/share?",
            "/share/",
            "/sharer",
            "intent/tweet",
            "intent/post",
            "l.facebook.com/l.php",   # FB outbound redirect
            "?fbclid=",
            "/plugins/",              # FB/LinkedIn embed plugins
            "linkedin.com/showcase/", # almost always a third-party product page
            "linkedin.com/feed/",
            "linkedin.com/login",
            "youtube.com/embed/",
            "youtube.com/watch?",     # video, not the channel
        )
    ):
        return None
    for key, hosts in SOCIAL_DOMAINS:
        for host in hosts:
            if f"//{host}" in h or f".{host}" in h or h.startswith(host) or f"://{host}" in h:
                return key
    return None


def social_query_selector() -> str:
    """Build a Playwright `a[href*=...]` selector covering every platform."""
    parts = []
    for _, hosts in SOCIAL_DOMAINS:
        for host in hosts:
            parts.append(f'a[href*="{host}"]')
    return ", ".join(parts)


# ──────────────────────────────────────────────────────────────────────────
# Search results
# ──────────────────────────────────────────────────────────────────────────

async def parse_search_page(page: Page) -> list[YPListing]:
    try:
        await page.wait_for_selector(
            "div.search-results.organic div.result, div.no-results, h1.no-results-title",
            timeout=15_000,
        )
    except PWTimeout:
        return []

    cards = await page.query_selector_all("div.search-results.organic div.result")
    listings: list[YPListing] = []
    for card in cards:
        async def text(sel: str) -> Optional[str]:
            el = await card.query_selector(sel)
            return (await el.inner_text()).strip() if el else None

        async def attr(sel: str, name: str) -> Optional[str]:
            el = await card.query_selector(sel)
            return await el.get_attribute(name) if el else None

        name = await text("a.business-name")
        href = await attr("a.business-name", "href")
        if not name or not href:
            continue
        detail_url = href if href.startswith("http") else YP_BASE + href

        phone = await text("div.phones.phone.primary, div.phones")
        street = await text(".adr .street-address")
        locality = await text(".adr .locality")
        region = await text("[itemprop='addressRegion']")
        postal = await text("[itemprop='postalCode']")

        city = None
        state = None
        if locality:
            m = re.match(r"^(.*?)(?:,\s*([A-Z]{2}))?(?:\s+(\d{5}))?$", locality.strip())
            if m:
                city = (m.group(1) or "").strip(", ") or None
                state = m.group(2) or region
                postal = postal or m.group(3)
        else:
            state = region

        category_els = await card.query_selector_all("div.categories > a")
        cats = [(await c.inner_text()).strip() for c in category_els]
        website = await attr("a.track-visit-website", "href")

        listings.append(
            YPListing(
                business_name=name,
                detail_url=detail_url,
                external_id=_extract_external_id(detail_url),
                category=cats[0] if cats else None,
                categories=cats,
                phone=phone,
                website=website,
                address=street,
                city=city,
                state=state,
                postal_code=postal,
                raw={"source": "search"},
            )
        )
    return listings


# ──────────────────────────────────────────────────────────────────────────
# Detail page enrichment
# ──────────────────────────────────────────────────────────────────────────

async def _extract_jsonld(page: Page, listing: YPListing) -> None:
    try:
        ld_blocks = await page.locator(
            'script[type="application/ld+json"]'
        ).all_text_contents()
    except Exception:
        return
    for block in ld_blocks:
        try:
            data = json.loads(block)
        except Exception:
            continue
        objs = data if isinstance(data, list) else [data]
        for obj in objs:
            if not isinstance(obj, dict):
                continue
            t = obj.get("@type")
            if isinstance(t, list):
                t = t[0] if t else ""
            if not isinstance(t, str):
                continue
            t_short = t.rsplit("/", 1)[-1]
            if t_short not in (
                "LocalBusiness", "Organization", "Store", "Restaurant",
                "ProfessionalService", "MedicalBusiness", "Dentist",
                "Physician", "AutomotiveBusiness", "HomeAndConstructionBusiness",
                "Plumber", "Electrician", "Locksmith", "RoofingContractor",
                "HousePainter", "MovingCompany", "GeneralContractor",
            ):
                continue
            listing.business_name = listing.business_name or obj.get("name") or ""
            tel = obj.get("telephone")
            if tel and not listing.phone:
                listing.phone = tel
            url = obj.get("url")
            if url and not listing.website:
                listing.website = url
            email = obj.get("email")
            if email and not listing.email:
                listing.email = str(email).replace("mailto:", "").strip()
            desc = obj.get("description")
            if desc and not listing.description:
                listing.description = desc
            addr = obj.get("address") or {}
            if isinstance(addr, dict):
                listing.address = listing.address or addr.get("streetAddress")
                listing.city = listing.city or addr.get("addressLocality")
                listing.state = listing.state or addr.get("addressRegion")
                listing.postal_code = listing.postal_code or addr.get("postalCode")
            geo = obj.get("geo") or {}
            if isinstance(geo, dict):
                try:
                    if geo.get("latitude") is not None:
                        listing.latitude = float(geo["latitude"])
                    if geo.get("longitude") is not None:
                        listing.longitude = float(geo["longitude"])
                except Exception:
                    pass
            agg = obj.get("aggregateRating")
            if isinstance(agg, dict):
                try:
                    if agg.get("ratingValue") is not None:
                        listing.rating = float(agg["ratingValue"])
                except Exception:
                    pass
                try:
                    if agg.get("reviewCount") is not None:
                        listing.review_count = int(agg["reviewCount"])
                    elif agg.get("ratingCount") is not None:
                        listing.review_count = int(agg["ratingCount"])
                except Exception:
                    pass
            logo = obj.get("logo") or obj.get("image")
            if logo:
                if isinstance(logo, dict):
                    logo = logo.get("url") or logo.get("contentUrl")
                if isinstance(logo, str):
                    listing.logo_url = listing.logo_url or logo
                    if logo not in listing.photos:
                        listing.photos.append(logo)
            return  # done with first matching object


async def _extract_dl_pairs(page: Page, listing: YPListing) -> None:
    """Walk the detail-page <dl> and fill listing fields by dd-class.

    YP gives each value-cell a stable class (`general-info`, `brands`,
    `payment`, `neighborhoods`, etc.). The label-cell <dt> has no class
    but its text is the user-visible label.
    """
    dls = await page.query_selector_all("dl")
    for dl in dls:
        children = await dl.query_selector_all("dt, dd")
        # Walk in pairs.
        i = 0
        while i < len(children) - 1:
            tag_a = await children[i].evaluate("e => e.tagName.toLowerCase()")
            if tag_a != "dt":
                i += 1
                continue
            label = (await children[i].inner_text()).strip().lower()
            j = i + 1
            # Skip any nested dts; the immediately following dd is our value.
            while j < len(children):
                tag_b = await children[j].evaluate("e => e.tagName.toLowerCase()")
                if tag_b == "dd":
                    break
                j += 1
            if j >= len(children):
                break
            dd = children[j]
            dd_class = (await dd.get_attribute("class")) or ""
            value_text = (await dd.inner_text()).strip()

            # Match by class first, fall back to label text.
            cls = dd_class.lower()
            if "general-info" in cls or label.startswith("general info"):
                if value_text and not listing.description:
                    listing.description = value_text
            elif "description" in cls and "business history" in label:
                if value_text:
                    listing.business_history = value_text
            elif "neighborhoods" in cls or label.startswith("neighborhood"):
                listing.neighborhoods = _split_csv(value_text)
            elif "weblinks" in cls or label.startswith("other link"):
                # multiple URLs separated by newlines
                links = []
                anchors = await dd.query_selector_all("a")
                for a in anchors:
                    h = await a.get_attribute("href")
                    if h and h.startswith("http"):
                        links.append(h)
                if not links:
                    links = [u.strip() for u in value_text.splitlines() if u.strip().startswith("http")]
                listing.other_links = links
            elif "categories" in cls or label == "categories":
                listing.categories = _split_csv(value_text)
                if listing.categories and not listing.category:
                    listing.category = listing.categories[0]
            elif label == "email":
                # primary mailto
                a = await dd.query_selector("a.email-business, a[href^='mailto:']")
                if a:
                    href = await a.get_attribute("href")
                    if href and href.startswith("mailto:"):
                        listing.email = href[len("mailto:"):].split("?")[0].strip()
            elif "logo" in cls or label == "logo":
                img = await dd.query_selector("img")
                if img:
                    src = await img.get_attribute("src") or await img.get_attribute("data-src")
                    if src:
                        listing.logo_url = listing.logo_url or src
            elif "banner-ad" in cls or label == "banner":
                img = await dd.query_selector("img")
                if img:
                    src = await img.get_attribute("src") or await img.get_attribute("data-src")
                    if src:
                        listing.banner_url = listing.banner_url or src
            elif "social-links" in cls or label.startswith("social"):
                anchors = await dd.query_selector_all("a")
                for a in anchors:
                    href = await a.get_attribute("href")
                    if not href:
                        continue
                    if classify_social(href) and href not in listing.socials:
                        listing.socials.append(href)
            elif label.startswith("year established") or label.startswith("in business since"):
                yr = _parse_int(value_text)
                if yr and 1800 < yr < 2100:
                    listing.year_established = yr
            elif "fax" in label and not listing.fax:
                listing.fax = value_text
            elif "bbb" in label:
                listing.bbb_grade = value_text
            i = j + 1


async def _extract_badges(page: Page, listing: YPListing) -> None:
    """Years in business, years with YP, claimed badge."""
    async def text(sel: str) -> Optional[str]:
        el = await page.query_selector(sel)
        return (await el.inner_text()).strip() if el else None

    yib = await text(".years-in-business .number, .years-in-business")
    if yib:
        n = _parse_int(yib)
        if n:
            listing.years_in_business = n

    ywyp = await text(".years-with-yp .number, .years-with-yp")
    if ywyp:
        n = _parse_int(ywyp)
        if n:
            listing.years_with_yp = n

    # Claimed badge — multiple shapes.
    for sel in (
        ".claim-info",
        ".claimed-badge",
        ".mobile-claimed-category",
        "span.claimed",
        "[class*='claimed']",
    ):
        el = await page.query_selector(sel)
        if el:
            txt = (await el.inner_text()).strip().lower()
            if "claimed" in txt:
                listing.claimed = True
                break


async def _extract_phones_emails(page: Page, listing: YPListing) -> None:
    """All `tel:` and `mailto:` anchors + regex-sweep of YP HTML for emails."""
    try:
        tel_anchors = await page.query_selector_all('a[href^="tel:"]')
        seen_phones: set[str] = set(listing.phones)
        for a in tel_anchors:
            href = await a.get_attribute("href")
            if not href:
                continue
            num = href[4:].strip()
            if num and num not in seen_phones:
                seen_phones.add(num)
                listing.phones.append(num)
        if listing.phones and not listing.phone:
            listing.phone = listing.phones[0]
    except Exception:
        pass

    # Collect every mailto: anchor.
    try:
        for a in await page.query_selector_all('a[href^="mailto:"]'):
            href = await a.get_attribute("href")
            if href and href.startswith("mailto:"):
                em = href[len("mailto:"):].split("?")[0].strip().lower()
                if em and em not in listing.emails:
                    listing.emails.append(em)
                if not listing.email and em:
                    listing.email = em
    except Exception:
        pass

    # Regex sweep the full YP page HTML — catches emails inside description
    # text or analytics blobs that aren't mailto anchors.
    try:
        html = await page.content()
        for m in re.finditer(
            r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", html
        ):
            em = m.group(0).lower().rstrip(".,;:")
            # quick filter — drop YP-internal / tracking / image-hash matches
            if any(b in em for b in ("yellowpages.com", "thryv.com", "yelp.com",
                                    "googleapis.com", "schema.org", "wixpress",
                                    "sentry.io")):
                continue
            if em.endswith((".png", ".jpg", ".jpeg", ".gif", ".svg")):
                continue
            local = em.split("@", 1)[0]
            if not re.match(r"^[a-z0-9._%+\-]+$", local):
                continue
            if em not in listing.emails:
                listing.emails.append(em)
            if not listing.email:
                listing.email = em
    except Exception:
        pass


async def _extract_socials_anywhere(page: Page, listing: YPListing) -> None:
    """Catch any social anchors anywhere on the page (icons block, footer, etc.)."""
    try:
        anchors = await page.query_selector_all(social_query_selector())
        for a in anchors:
            href = await a.get_attribute("href")
            if not href:
                continue
            if classify_social(href) and href not in listing.socials:
                listing.socials.append(href)
    except Exception:
        pass


async def _extract_photos(page: Page, listing: YPListing) -> None:
    try:
        imgs = await page.query_selector_all(
            "div.media-thumbnail-wrapper img, div.gallery-list img, "
            "div.photos img, .gallery img"
        )
        seen: set[str] = set(listing.photos)
        for im in imgs:
            src = await im.get_attribute("src") or await im.get_attribute("data-src")
            if src and src not in seen:
                seen.add(src)
                listing.photos.append(src)
    except Exception:
        pass


async def enrich_from_detail(page: Page, listing: YPListing) -> YPListing:
    try:
        await goto(page, listing.detail_url)
    except Exception:
        return listing
    try:
        await page.wait_for_selector("h1.business-name, h1.dockable, body", timeout=8_000)
    except PWTimeout:
        pass

    await _extract_jsonld(page, listing)
    await _extract_dl_pairs(page, listing)
    await _extract_badges(page, listing)
    await _extract_phones_emails(page, listing)
    await _extract_socials_anywhere(page, listing)
    await _extract_photos(page, listing)

    # h1 fallback
    if not listing.business_name:
        h1 = await page.query_selector("h1.business-name, h1.dockable")
        if h1:
            listing.business_name = (await h1.inner_text()).strip()

    listing.raw["detail"] = True
    return listing


def listing_to_dict(l: YPListing) -> dict[str, Any]:
    return asdict(l)
