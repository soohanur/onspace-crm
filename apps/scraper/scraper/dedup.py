from __future__ import annotations
import hashlib
import re


_PHONE_RE = re.compile(r"\D+")
_WS_RE = re.compile(r"\s+")


def normalize_phone(phone: str | None) -> str:
    if not phone:
        return ""
    digits = _PHONE_RE.sub("", phone)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits


def normalize_text(s: str | None) -> str:
    if not s:
        return ""
    return _WS_RE.sub(" ", s.strip().lower())


def dedup_hash(business_name: str | None, phone: str | None, address: str | None) -> str:
    base = "|".join(
        [
            normalize_text(business_name),
            normalize_phone(phone),
            normalize_text(address),
        ]
    )
    return hashlib.sha1(base.encode("utf-8")).hexdigest()
