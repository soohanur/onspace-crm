"""Direct Postgres writes — bypasses NestJS to keep per-lead overhead low."""
from __future__ import annotations
import json
import os
import uuid
from typing import Any, Optional

import psycopg
from psycopg.rows import dict_row


def get_conn() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not set")
    if "?" in url:
        base, qs = url.split("?", 1)
        params = [p for p in qs.split("&") if not p.startswith("schema=")]
        url = base + (("?" + "&".join(params)) if params else "")
    return psycopg.connect(url, row_factory=dict_row, autocommit=True)


def upsert_lead(conn: psycopg.Connection, **lead: Any) -> bool:
    sql = """
    INSERT INTO leads (
        id, job_id, source, source_url, external_id,
        search_query, search_location,
        business_name, category, categories, phone, phones, fax,
        email, emails, website, other_links,
        address, address2, city, state, postal_code, country, latitude, longitude,
        description, business_history, year_established,
        neighborhoods,
        rating, review_count, bbb_grade, years_in_business, years_with_yp, claimed,
        photos, logo_url, banner_url, socials,
        owner_name, owner_email, owner_phone, owner_linkedin, owner_search_url,
        raw_payload, dedup_hash, created_at, updated_at
    ) VALUES (
        %(id)s, %(job_id)s, 'yellowpages', %(source_url)s, %(external_id)s,
        %(search_query)s, %(search_location)s,
        %(business_name)s, %(category)s, %(categories)s, %(phone)s, %(phones)s, %(fax)s,
        %(email)s, %(emails)s, %(website)s, %(other_links)s,
        %(address)s, %(address2)s, %(city)s, %(state)s, %(postal_code)s, %(country)s, %(latitude)s, %(longitude)s,
        %(description)s, %(business_history)s, %(year_established)s,
        %(neighborhoods)s,
        %(rating)s, %(review_count)s, %(bbb_grade)s, %(years_in_business)s, %(years_with_yp)s, %(claimed)s,
        %(photos)s, %(logo_url)s, %(banner_url)s, %(socials)s,
        %(owner_name)s, %(owner_email)s, %(owner_phone)s, %(owner_linkedin)s, %(owner_search_url)s,
        %(raw_payload)s::jsonb, %(dedup_hash)s, NOW(), NOW()
    )
    ON CONFLICT (source, dedup_hash) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, leads.email),
        emails = CASE WHEN array_length(EXCLUDED.emails, 1) > 0 THEN EXCLUDED.emails ELSE leads.emails END,
        website = COALESCE(EXCLUDED.website, leads.website),
        phones = CASE WHEN array_length(EXCLUDED.phones, 1) > 0 THEN EXCLUDED.phones ELSE leads.phones END,
        socials = CASE WHEN array_length(EXCLUDED.socials, 1) > 0 THEN EXCLUDED.socials ELSE leads.socials END,
        description = COALESCE(EXCLUDED.description, leads.description),
        business_history = COALESCE(EXCLUDED.business_history, leads.business_history),
        year_established = COALESCE(EXCLUDED.year_established, leads.year_established),
        neighborhoods = CASE WHEN array_length(EXCLUDED.neighborhoods, 1) > 0 THEN EXCLUDED.neighborhoods ELSE leads.neighborhoods END,
        rating = COALESCE(EXCLUDED.rating, leads.rating),
        review_count = COALESCE(EXCLUDED.review_count, leads.review_count),
        years_in_business = COALESCE(EXCLUDED.years_in_business, leads.years_in_business),
        years_with_yp = COALESCE(EXCLUDED.years_with_yp, leads.years_with_yp),
        claimed = leads.claimed OR EXCLUDED.claimed,
        logo_url = COALESCE(EXCLUDED.logo_url, leads.logo_url),
        banner_url = COALESCE(EXCLUDED.banner_url, leads.banner_url),
        other_links = CASE WHEN array_length(EXCLUDED.other_links, 1) > 0 THEN EXCLUDED.other_links ELSE leads.other_links END,
        owner_email = COALESCE(EXCLUDED.owner_email, leads.owner_email),
        owner_linkedin = COALESCE(EXCLUDED.owner_linkedin, leads.owner_linkedin),
        owner_search_url = COALESCE(EXCLUDED.owner_search_url, leads.owner_search_url),
        updated_at = NOW()
    RETURNING (xmax = 0) AS inserted;
    """
    params = {
        "id": str(uuid.uuid4()),
        "job_id": lead.get("job_id"),
        "source_url": lead.get("source_url"),
        "external_id": lead.get("external_id"),
        "search_query": lead["search_query"],
        "search_location": lead["search_location"],
        "business_name": lead["business_name"],
        "category": lead.get("category"),
        "categories": lead.get("categories") or [],
        "phone": lead.get("phone"),
        "phones": lead.get("phones") or [],
        "fax": lead.get("fax"),
        "email": lead.get("email"),
        "emails": lead.get("emails") or [],
        "website": lead.get("website"),
        "other_links": lead.get("other_links") or [],
        "address": lead.get("address"),
        "address2": lead.get("address2"),
        "city": lead.get("city"),
        "state": lead.get("state"),
        "postal_code": lead.get("postal_code"),
        "country": lead.get("country") or "US",
        "latitude": lead.get("latitude"),
        "longitude": lead.get("longitude"),
        "description": lead.get("description"),
        "business_history": lead.get("business_history"),
        "year_established": lead.get("year_established"),
        "neighborhoods": lead.get("neighborhoods") or [],
        "rating": lead.get("rating"),
        "review_count": lead.get("review_count"),
        "bbb_grade": lead.get("bbb_grade"),
        "years_in_business": lead.get("years_in_business"),
        "years_with_yp": lead.get("years_with_yp"),
        "claimed": bool(lead.get("claimed", False)),
        "photos": lead.get("photos") or [],
        "logo_url": lead.get("logo_url"),
        "banner_url": lead.get("banner_url"),
        "socials": lead.get("socials") or [],
        "owner_name": lead.get("owner_name"),
        "owner_email": lead.get("owner_email"),
        "owner_phone": lead.get("owner_phone"),
        "owner_linkedin": lead.get("owner_linkedin"),
        "owner_search_url": lead.get("owner_search_url"),
        "raw_payload": json.dumps(lead.get("raw_payload") or {}),
        "dedup_hash": lead["dedup_hash"],
    }
    with conn.cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        return bool(row and row.get("inserted"))


def lead_exists(
    conn: psycopg.Connection,
    *,
    source: str,
    external_id: Optional[str],
    source_url: Optional[str],
) -> bool:
    """Pre-fetch dedup check. True if a row already exists keyed on this
    source's external_id OR source_url. Lets the scraper skip opening
    detail pages for companies it already harvested. Both keys checked in
    one query so a single round trip covers either match."""
    if not external_id and not source_url:
        return False
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM leads
            WHERE source = %s
              AND (
                (external_id IS NOT NULL AND external_id = %s)
                OR
                (source_url IS NOT NULL AND source_url = %s)
              )
            LIMIT 1
            """,
            (source, external_id, source_url),
        )
        return cur.fetchone() is not None
