-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('outbound', 'inbound');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('answered', 'no_answer', 'voicemail', 'busy', 'wrong_number', 'do_not_call', 'scheduled_callback');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('scheduled', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "assigned_to" TEXT,
    "direction" "CallDirection" NOT NULL,
    "to_phone" TEXT,
    "from_phone" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "duration_sec" INTEGER,
    "outcome" "CallOutcome",
    "status" "CallStatus" NOT NULL DEFAULT 'completed',
    "notes" TEXT,
    "voicemail_left" BOOLEAN NOT NULL DEFAULT false,
    "next_action" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calls_lead_id_idx" ON "calls"("lead_id");

-- CreateIndex
CREATE INDEX "calls_occurred_at_idx" ON "calls"("occurred_at");

-- CreateIndex
CREATE INDEX "calls_direction_status_idx" ON "calls"("direction", "status");

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
