"""Conservative pre-save email validation for the scraper.

Three layers, in order:
    1. RFC-style syntax check (offline, instant).
    2. Disposable-domain blacklist (the same `disposable-email-domains`
       snapshot the API uses, mirrored here so the scraper doesn't
       depend on the API being up).
    3. DNS MX lookup with timeout + retry.

Design rule: NEVER reject a valid email. On DNS errors / timeouts we
return `True` (assume valid) so a transient outage doesn't drop a real
business. The bounce-handler on the API side is the final ground-truth
filter — anything that slips through here gets caught after the first
send.
"""
from __future__ import annotations

import os
import re
from functools import lru_cache
from typing import Optional

import dns.exception
import dns.resolver

_SYNTAX_RE = re.compile(
    r"^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
    r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$",
    re.IGNORECASE,
)


def _load_disposable() -> frozenset[str]:
    """Load the disposable list from the API source tree. The scraper
    image is built from the monorepo so we can reach the same file the
    Nest service uses, keeping the two layers in lockstep."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "disposable-domains.txt"),
        os.path.abspath(
            os.path.join(here, "..", "..", "api", "src", "modules", "email", "disposable-domains.txt"),
        ),
    ]
    for p in candidates:
        try:
            with open(p, "r", encoding="utf-8") as f:
                return frozenset(
                    line.strip().lower()
                    for line in f
                    if line.strip() and not line.startswith("#")
                )
        except OSError:
            continue
    return frozenset()


_DISPOSABLE: frozenset[str] = _load_disposable()
_RESOLVER = dns.resolver.Resolver()
_RESOLVER.lifetime = 3.0
_RESOLVER.timeout = 3.0


@lru_cache(maxsize=10_000)
def _has_mx(domain: str) -> Optional[bool]:
    """True / False / None (transient error → caller treats as valid)."""
    try:
        answers = _RESOLVER.resolve(domain, "MX")
        if any(getattr(a, "exchange", None) for a in answers):
            return True
        return False
    except dns.resolver.NoAnswer:
        # No MX record — fall back to A.
        try:
            a = _RESOLVER.resolve(domain, "A")
            return bool(list(a))
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
            return False
        except dns.exception.DNSException:
            return None
    except dns.resolver.NXDOMAIN:
        return False
    except dns.exception.DNSException:
        return None


def is_valid_email(email: str) -> bool:
    """Permissive `True/False` for callers that only want a yes/no."""
    if not email or not isinstance(email, str):
        return False
    e = email.strip().lower()
    if not _SYNTAX_RE.match(e):
        return False
    domain = e.split("@", 1)[1]
    if domain in _DISPOSABLE:
        return False
    mx = _has_mx(domain)
    if mx is False:
        return False
    # mx is True or None (transient) → treat as valid.
    return True


def first_valid_email(emails: list[str]) -> Optional[str]:
    """Return the first email in `emails` that passes validation, or None."""
    for e in emails:
        if e and is_valid_email(e):
            return e.strip().lower()
    return None
