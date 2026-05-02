-- CreateEnum
CREATE TYPE "ScrapeJobStatus" AS ENUM ('queued', 'running', 'done', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "scrape_jobs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'yellowpages',
    "search_query" TEXT NOT NULL,
    "search_location" TEXT NOT NULL,
    "status" "ScrapeJobStatus" NOT NULL DEFAULT 'queued',
    "total_found" INTEGER NOT NULL DEFAULT 0,
    "total_saved" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrape_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "job_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'yellowpages',
    "source_url" TEXT,
    "external_id" TEXT,
    "search_query" TEXT NOT NULL,
    "search_location" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "category" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phone" TEXT,
    "phones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fax" TEXT,
    "email" TEXT,
    "emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "website" TEXT,
    "address" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT DEFAULT 'US',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "description" TEXT,
    "year_established" INTEGER,
    "hours_of_operation" JSONB,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payment_methods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" DOUBLE PRECISION,
    "review_count" INTEGER,
    "bbb_grade" TEXT,
    "years_in_business" INTEGER,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "logo_url" TEXT,
    "social" JSONB NOT NULL DEFAULT '{}',
    "owner_name" TEXT,
    "owner_email" TEXT,
    "owner_phone" TEXT,
    "owner_linkedin" TEXT,
    "owner_search_url" TEXT,
    "dedup_hash" TEXT,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scrape_jobs_status_idx" ON "scrape_jobs"("status");

-- CreateIndex
CREATE INDEX "scrape_jobs_search_query_search_location_idx" ON "scrape_jobs"("search_query", "search_location");

-- CreateIndex
CREATE INDEX "leads_search_query_search_location_idx" ON "leads"("search_query", "search_location");

-- CreateIndex
CREATE INDEX "leads_city_state_idx" ON "leads"("city", "state");

-- CreateIndex
CREATE INDEX "leads_website_idx" ON "leads"("website");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "leads_source_dedup_hash_key" ON "leads"("source", "dedup_hash");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "scrape_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
