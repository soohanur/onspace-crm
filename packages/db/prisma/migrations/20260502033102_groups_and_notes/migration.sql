-- CreateEnum
CREATE TYPE "GroupType" AS ENUM ('manual', 'smart');

-- CreateTable
CREATE TABLE "lead_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "GroupType" NOT NULL,
    "filter_dsl" JSONB,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_group_members" (
    "group_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_group_members_pkey" PRIMARY KEY ("group_id","lead_id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_groups_type_idx" ON "lead_groups"("type");

-- CreateIndex
CREATE INDEX "lead_groups_created_at_idx" ON "lead_groups"("created_at");

-- CreateIndex
CREATE INDEX "lead_group_members_lead_id_idx" ON "lead_group_members"("lead_id");

-- CreateIndex
CREATE INDEX "notes_lead_id_created_at_idx" ON "notes"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "leads_rating_idx" ON "leads"("rating");

-- CreateIndex
CREATE INDEX "leads_years_in_business_idx" ON "leads"("years_in_business");

-- AddForeignKey
ALTER TABLE "lead_group_members" ADD CONSTRAINT "lead_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lead_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_group_members" ADD CONSTRAINT "lead_group_members_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
