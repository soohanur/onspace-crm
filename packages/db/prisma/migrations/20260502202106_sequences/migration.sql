-- CreateEnum
CREATE TYPE "SequenceStatus" AS ENUM ('draft', 'active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('active', 'completed', 'exited_replied', 'exited_stage', 'exited_manual');

-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN     "sequence_enrollment_send_id" TEXT;

-- CreateTable
CREATE TABLE "sequences" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "SequenceStatus" NOT NULL DEFAULT 'draft',
    "group_id" TEXT,
    "account_id" TEXT NOT NULL,
    "daily_send_limit" INTEGER NOT NULL DEFAULT 250,
    "send_interval_sec" INTEGER NOT NULL DEFAULT 12,
    "enrolled_count" INTEGER NOT NULL DEFAULT 0,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "exited_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_steps" (
    "id" TEXT NOT NULL,
    "sequence_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "delay_days" INTEGER NOT NULL DEFAULT 0,
    "template_id" TEXT NOT NULL,
    "stop_on_reply" BOOLEAN NOT NULL DEFAULT true,
    "stop_on_stage_progression" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequence_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_enrollments" (
    "id" TEXT NOT NULL,
    "sequence_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "to_email" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'active',
    "next_step_order" INTEGER NOT NULL DEFAULT 0,
    "next_send_at" TIMESTAMP(3) NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exited_at" TIMESTAMP(3),
    "exit_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sequence_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_enrollment_sends" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "rendered_subject" TEXT NOT NULL,
    "rendered_body_text" TEXT NOT NULL,
    "rendered_body_html" TEXT,
    "email_log_id" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequence_enrollment_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sequences_status_idx" ON "sequences"("status");

-- CreateIndex
CREATE INDEX "sequences_created_at_idx" ON "sequences"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sequence_steps_sequence_id_order_key" ON "sequence_steps"("sequence_id", "order");

-- CreateIndex
CREATE INDEX "sequence_enrollments_status_next_send_at_idx" ON "sequence_enrollments"("status", "next_send_at");

-- CreateIndex
CREATE UNIQUE INDEX "sequence_enrollments_sequence_id_lead_id_key" ON "sequence_enrollments"("sequence_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "sequence_enrollment_sends_email_log_id_key" ON "sequence_enrollment_sends"("email_log_id");

-- CreateIndex
CREATE INDEX "sequence_enrollment_sends_sent_at_idx" ON "sequence_enrollment_sends"("sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "sequence_enrollment_sends_enrollment_id_step_order_key" ON "sequence_enrollment_sends"("enrollment_id", "step_order");

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_sequence_enrollment_send_id_key" ON "email_logs"("sequence_enrollment_send_id");

-- AddForeignKey
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lead_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "email_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_enrollment_sends" ADD CONSTRAINT "sequence_enrollment_sends_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "sequence_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_enrollment_sends" ADD CONSTRAINT "sequence_enrollment_sends_email_log_id_fkey" FOREIGN KEY ("email_log_id") REFERENCES "email_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
