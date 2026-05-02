-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "account_id" TEXT,
ADD COLUMN     "attendee_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "external_event_id" TEXT,
ADD COLUMN     "external_link" TEXT,
ADD COLUMN     "external_provider" TEXT,
ADD COLUMN     "last_synced_at" TIMESTAMP(3),
ADD COLUMN     "sync_error" TEXT;

-- CreateIndex
CREATE INDEX "meetings_external_event_id_idx" ON "meetings"("external_event_id");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "email_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
