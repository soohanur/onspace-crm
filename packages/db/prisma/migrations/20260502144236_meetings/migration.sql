-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('phone', 'zoom', 'google_meet', 'in_person', 'other');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "title" TEXT NOT NULL,
    "type" "MeetingType" NOT NULL DEFAULT 'phone',
    "meeting_link" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 30,
    "status" "MeetingStatus" NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "next_action" TEXT,
    "assigned_to" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meetings_lead_id_idx" ON "meetings"("lead_id");

-- CreateIndex
CREATE INDEX "meetings_status_scheduled_at_idx" ON "meetings"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "meetings_scheduled_at_idx" ON "meetings"("scheduled_at");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
