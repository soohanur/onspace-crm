-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('owner', 'manager', 'staff', 'general');

-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('manual', 'website', 'directory', 'enrichment');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('unverified', 'verified', 'invalid');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('new', 'approached', 'no_response', 'engaged', 'push', 'qualified', 'interested', 'booked', 'proposal_sent', 'converted', 'not_converted', 'lost');

-- CreateEnum
CREATE TYPE "LeadValidity" AS ENUM ('valid', 'invalid');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('none', 'needed', 'scheduled', 'completed', 'overdue');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "follow_up_status" "FollowUpStatus" NOT NULL DEFAULT 'none',
ADD COLUMN     "score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stage" "LeadStage" NOT NULL DEFAULT 'new',
ADD COLUMN     "validity" "LeadValidity" NOT NULL DEFAULT 'valid';

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_type" "ContactType" NOT NULL DEFAULT 'general',
    "email" TEXT,
    "phone" TEXT,
    "linkedin" TEXT,
    "social_profile" TEXT,
    "source" "ContactSource" NOT NULL DEFAULT 'manual',
    "confidence" "Confidence" NOT NULL DEFAULT 'low',
    "status" "ContactStatus" NOT NULL DEFAULT 'unverified',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_lead_id_idx" ON "contacts"("lead_id");

-- CreateIndex
CREATE INDEX "contacts_lead_id_is_primary_idx" ON "contacts"("lead_id", "is_primary");

-- CreateIndex
CREATE INDEX "leads_stage_idx" ON "leads"("stage");

-- CreateIndex
CREATE INDEX "leads_validity_idx" ON "leads"("validity");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: migrate every existing lead's owner_* columns into a primary
-- Contact row of type 'owner'. The legacy columns stay populated so the
-- scraper and existing readers keep working until a later phase removes
-- them. Confidence is 'medium' since this came from enrichment heuristics
-- (Hunter / state registries / page scraping) rather than user verification.
INSERT INTO contacts (
  id, lead_id, name, contact_type, email, phone, linkedin,
  source, confidence, status, is_primary, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  id,
  owner_name,
  'owner'::"ContactType",
  owner_email,
  owner_phone,
  owner_linkedin,
  'enrichment'::"ContactSource",
  'medium'::"Confidence",
  'unverified'::"ContactStatus",
  true,
  NOW(),
  NOW()
FROM leads
WHERE owner_name IS NOT NULL;
