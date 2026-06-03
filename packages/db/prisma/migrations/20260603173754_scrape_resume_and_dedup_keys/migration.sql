-- Resume support on scrape_jobs
ALTER TABLE "scrape_jobs"
  ADD COLUMN "last_page" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pages_scanned" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "exhausted" BOOLEAN NOT NULL DEFAULT false;

-- Scrape-time dedup keys. Pre-fetch SELECTs against these let Python skip
-- companies it already saved without opening their detail page.
-- NULLs are distinct in PG, so legacy rows without these keys don't collide.
CREATE UNIQUE INDEX "leads_source_external_id_key" ON "leads" ("source", "external_id");
CREATE UNIQUE INDEX "leads_source_url_key" ON "leads" ("source_url");
