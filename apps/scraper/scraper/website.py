"""Best-effort email + social harvest from the business's own website.

Strategy (footer-first, then contact page):

  1. Skip YellowPages stub sites (`*.localsearch.com`) — no data ever.
  2. Open the homepage with `networkidle` (so JS-rendered emails appear).
  3. **Look at the FOOTER first** — most businesses put their email there.
  4. Regex-sweep the full HTML + decode Cloudflare-obfuscated emails
     (`data-cfemail="..."`). This is the most common protection scheme
     and decoding it unlocks emails on a huge fraction of sites.
  5. Collect every social anchor on the homepage.
  6. If still no email: discover contact-ish links from the page itself
     (`/contact`, `/aboutus`, `/get-quote`, etc — whatever the site
     actually links to) and crawl those.
  7. As last resort, probe a fixed list of common paths.

Returns: {email, all_emails, social: {platform: url}}
"""
from __future__ import annotations

import asyncio
import re
from typing import Iterable, Optional
from urllib.parse import urljoin, urlparse

from playwright.async_api import BrowserContext, Page, TimeoutError as PWTimeout

from .yellowpages import classify_social, social_query_selector


# Fallback paths if the homepage doesn't link to contact-ish pages.
FALLBACK_CONTACT_PATHS = [
    "/contact",
    "/contact-us",
    "/contactus",
    "/contact_us",
    "/about",
    "/about-us",
    "/aboutus",
    "/about_us",
    "/get-in-touch",
    "/get-a-quote",
    "/quote",
    "/locations",
    "/team",
    "/our-team",
    "/staff",
]

# Skip YP-managed stub sites entirely — they never have real contact info.
STUB_HOSTS = (
    "localsearch.com",
    "yellowpages.com",
)

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# US phone matcher — tolerates +1, parens, dashes, dots, spaces. Conservative
# enough to skip random number runs in the page HTML.
_PHONE_RE = re.compile(
    r"(?:\+?1[\s\-.])?\(?\b\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}\b"
)
_CFEMAIL_RE = re.compile(r'data-cfemail="([0-9a-f]+)"', re.I)
_HREF_RE = re.compile(r'href=["\']([^"\']+)["\']', re.I)
_CONTACTISH_RE = re.compile(r"(?:contact|about|team|staff|get[-_ ]in[-_ ]touch|quote)", re.I)
# Obfuscation patterns: "user (at) example dot com" / "user [at] example.com" / etc.
_OBFUSCATED_EMAIL_RE = re.compile(
    r"([A-Za-z0-9._%+\-]+)\s*(?:\[at\]|\(at\)|@| at | AT )\s*"
    r"([A-Za-z0-9.\-]+)\s*(?:\[dot\]|\(dot\)| dot | DOT |\.)\s*([A-Za-z]{2,})",
    re.I,
)
# JSON / JSON-LD shapes: "email": "x@y.com", "mail": "...", "contactEmail": "..."
_JSON_EMAIL_RE = re.compile(
    r'"(?:email|mail|contactEmail|emailAddress)"\s*:\s*"([^"]+@[^"]+)"',
    re.I,
)

_BAD_EMAIL_DOMAINS = (
    "wixpress.com",
    "sentry.io",
    "sentry-next.wixpress.com",
    "example.com",
    "godaddy.com",
    "domainsbyproxy.com",
    "whoisguard.com",
    "yellowpages.com",
    "thryv.com",
    "yelp.com",
    "u.email",
    "googleapis.com",
    "google.com",
    "fontawesome.com",
    "schema.org",
    "w3.org",
)
_BAD_EMAIL_PREFIXES = (
    "noreply",
    "no-reply",
    "donotreply",
    "do-not-reply",
    "postmaster",
    "abuse",
    "mailer-daemon",
    "u003e",        # html entity garbage
)


# ──────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────

def decode_cfemail(hex_str: str) -> Optional[str]:
    """Decode a Cloudflare-obfuscated email (`data-cfemail` value).

    Format: first byte is the XOR key, rest are XOR-encoded ASCII bytes of
    the email. Cloudflare uses this to hide emails from naive scrapers.
    """
    try:
        if len(hex_str) < 4 or len(hex_str) % 2 != 0:
            return None
        r = int(hex_str[:2], 16)
        out = []
        for i in range(2, len(hex_str), 2):
            out.append(chr(int(hex_str[i:i + 2], 16) ^ r))
        s = "".join(out)
        if "@" in s and "." in s.split("@", 1)[1]:
            return s
    except Exception:
        return None
    return None


def _filter_emails(emails: Iterable[str], site_host: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    site_root = ".".join(site_host.split(".")[-2:]) if site_host else ""
    for raw in emails:
        e = raw.strip().lower().rstrip(".,;:")
        if not e or e in seen:
            continue
        if any(b in e for b in _BAD_EMAIL_DOMAINS):
            continue
        if any(e.startswith(p + "@") for p in _BAD_EMAIL_PREFIXES):
            continue
        if e.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico")):
            continue
        if "@" not in e or e.count("@") > 1:
            continue
        local, _, domain = e.partition("@")
        if not local or "." not in domain:
            continue
        # Drop entity-decoded garbage like "&u003e@x.com".
        if not re.match(r"^[a-z0-9._%+\-]+$", local):
            continue
        seen.add(e)
        out.append(e)
    if site_root:
        out.sort(key=lambda e: 0 if site_root in e else 1)
    return out


def _normalize_website(website: str) -> tuple[str, str] | None:
    parsed = urlparse(website if website.startswith("http") else f"http://{website}")
    if not parsed.netloc:
        return None
    base = f"{parsed.scheme or 'https'}://{parsed.netloc}"
    return base, parsed.netloc.lower()


def _is_stub(host: str) -> bool:
    h = host.lower()
    return any(stub in h for stub in STUB_HOSTS)


# ──────────────────────────────────────────────────────────────────────────
# Per-page extraction
# ──────────────────────────────────────────────────────────────────────────

async def _extract_page(page: Page) -> tuple[set[str], set[str], set[str], set[str]]:
    """Return (emails, social_urls, contactish_links, phones) found on the
    current page.

    `emails` includes both regex matches in HTML and decoded Cloudflare ones.
    `social_urls` is a flat set of every recognized social profile URL.
    `contactish_links` are absolute URLs to pages with contact/about/team in
    the path — used to drive the next crawl step.
    `phones` is every `tel:` anchor target + regex hits in footer/contact
    HTML, normalized lightly (digits + leading + only).
    """
    emails: set[str] = set()
    social_urls: set[str] = set()
    contact_links: set[str] = set()
    phones: set[str] = set()

    # 1. mailto anchors (most reliable)
    try:
        for a in await page.query_selector_all('a[href^="mailto:"]'):
            href = await a.get_attribute("href")
            if not href:
                continue
            em = href[len("mailto:"):].split("?")[0].strip()
            if "@" in em:
                emails.add(em)
    except Exception:
        pass

    # 1b. tel: anchors (highest-trust phone signal)
    try:
        for a in await page.query_selector_all('a[href^="tel:"]'):
            href = await a.get_attribute("href")
            if not href:
                continue
            raw = href[len("tel:"):].split("?")[0].strip()
            digits = re.sub(r"[^\d+]", "", raw)
            if len(re.sub(r"\D", "", digits)) >= 10:
                phones.add(digits)
    except Exception:
        pass

    # 2. Social anchors — collect every URL classified as a social platform.
    try:
        for a in await page.query_selector_all(social_query_selector()):
            href = await a.get_attribute("href")
            if not href:
                continue
            if classify_social(href):
                social_urls.add(href)
    except Exception:
        pass

    # 3. Footer scan first (most businesses put email + phone there)
    try:
        footer = await page.query_selector("footer, .footer, #footer, [class*='Footer'], [id*='footer']")
        if footer:
            footer_text = await footer.inner_text()
            for m in _EMAIL_RE.finditer(footer_text):
                emails.add(m.group(0))
            for m in _PHONE_RE.finditer(footer_text):
                phones.add(m.group(0).strip())
            footer_html = await footer.evaluate("e => e.outerHTML")
            for m in _CFEMAIL_RE.finditer(footer_html):
                dec = decode_cfemail(m.group(1))
                if dec:
                    emails.add(dec)
    except Exception:
        pass

    # 4. Full HTML sweep (regex + Cloudflare decode)
    try:
        html = await page.content()
    except Exception:
        html = ""
    if html:
        for m in _EMAIL_RE.finditer(html):
            emails.add(m.group(0))
        for m in _CFEMAIL_RE.finditer(html):
            dec = decode_cfemail(m.group(1))
            if dec:
                emails.add(dec)

        # 4b. HTML entity-decoded sweep ('&#64;' / '&commat;' → '@', '&#46;' → '.')
        try:
            import html as _html_mod

            decoded = _html_mod.unescape(html)
            if decoded != html:
                for m in _EMAIL_RE.finditer(decoded):
                    emails.add(m.group(0))
        except Exception:
            pass

        # 4c. JSON-LD / inline-JSON 'email' fields — Wix/Squarespace/Shopify
        # frequently embed the business email here even when the visible page
        # has only a contact form.
        try:
            for m in _JSON_EMAIL_RE.finditer(html):
                em = m.group(1).strip()
                if "@" in em and "." in em.split("@", 1)[1]:
                    emails.add(em)
        except Exception:
            pass

        # 4d. Obfuscated patterns ("info (at) example dot com") — reconstruct
        # to a clean address.
        try:
            for m in _OBFUSCATED_EMAIL_RE.finditer(html):
                local = m.group(1)
                domain = m.group(2)
                tld = m.group(3)
                cand = f"{local}@{domain}.{tld}".lower()
                if _EMAIL_RE.fullmatch(cand):
                    emails.add(cand)
        except Exception:
            pass

    # 4e. Visible body text scan — catches emails rendered into the DOM as
    # text rather than mailto: anchors (common in Wix/Squarespace sites).
    try:
        body_text = await page.inner_text("body")
        if body_text:
            for m in _EMAIL_RE.finditer(body_text):
                emails.add(m.group(0))
            for m in _OBFUSCATED_EMAIL_RE.finditer(body_text):
                cand = f"{m.group(1)}@{m.group(2)}.{m.group(3)}".lower()
                if _EMAIL_RE.fullmatch(cand):
                    emails.add(cand)
    except Exception:
        pass

    if html:
        # 5. Discover contact-ish links from the homepage
        try:
            page_url = page.url
        except Exception:
            page_url = ""
        for m in _HREF_RE.finditer(html):
            href = m.group(1)
            if not href or href.startswith(("javascript:", "mailto:", "tel:", "#")):
                continue
            if not _CONTACTISH_RE.search(href):
                continue
            try:
                abs_url = urljoin(page_url or "", href)
            except Exception:
                continue
            contact_links.add(abs_url)

    return emails, social_urls, contact_links, phones


# ──────────────────────────────────────────────────────────────────────────
# Public entry
# ──────────────────────────────────────────────────────────────────────────

async def harvest_from_website(
    ctx: BrowserContext,
    website: str,
) -> dict[str, object]:
    """Returns {email, all_emails: [..], socials: [url, ...]}."""
    out: dict[str, object] = {"email": None, "socials": [], "all_emails": []}
    if not website:
        return out
    norm = _normalize_website(website)
    if not norm:
        return out
    base, site_host = norm
    if _is_stub(site_host):
        return out

    emails: set[str] = set()
    socials: set[str] = set()
    phones: set[str] = set()
    visited: set[str] = set()

    async def visit(url: str) -> set[str]:
        if url in visited:
            return set()
        visited.add(url)
        page = await ctx.new_page()
        try:
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=15_000)
            except PWTimeout:
                pass
            # Bumped from 4s → 8s. Wix/Squarespace contact pages frequently
            # finish rendering email-bearing JSON/widgets only after several
            # extra fetches; 4s was too short.
            try:
                await page.wait_for_load_state("networkidle", timeout=8_000)
            except PWTimeout:
                pass
            page_emails, page_socials, page_links, page_phones = await _extract_page(page)
            emails.update(page_emails)
            socials.update(page_socials)
            phones.update(page_phones)
            return page_links
        except Exception:
            return set()
        finally:
            try:
                await page.close()
            except Exception:
                pass

    # Step 1: homepage — emails are usually in footer; socials in header/footer.
    discovered = await visit(base + "/")
    homepage_email_count = len(_filter_emails(emails, site_host))

    # Step 2: still no email AND/OR no socials? follow contact-ish links.
    # Cap raised 5 → 10 — many sites have several contact/about/team links
    # but the email lives behind one specific page (e.g. "team", "owners").
    if (homepage_email_count == 0 or not socials) and discovered:
        for link in list(discovered)[:10]:
            await visit(link)
            if _filter_emails(emails, site_host) and socials:
                break
            await asyncio.sleep(0.2)

    # Step 3: still nothing? probe fallback fixed paths.
    if not _filter_emails(emails, site_host):
        for path in FALLBACK_CONTACT_PATHS:
            url = urljoin(base, path)
            if url in visited:
                continue
            await visit(url)
            if _filter_emails(emails, site_host):
                break
            await asyncio.sleep(0.2)

    filtered = _filter_emails(emails, site_host)
    out["email"] = filtered[0] if filtered else None
    out["all_emails"] = filtered
    out["socials"] = sorted(socials)
    out["phones"] = sorted(phones)
    return out


def guess_owner_linkedin_search_url(business_name: str) -> str:
    from urllib.parse import quote_plus
    q = f'site:linkedin.com/in "{business_name}" (owner OR founder OR CEO OR president)'
    return f"https://www.google.com/search?q={quote_plus(q)}"
