-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN     "attachments" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "email_replies" (
    "id" TEXT NOT NULL,
    "email_log_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "gmail_message_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "to_email" TEXT,
    "subject" TEXT,
    "snippet" TEXT,
    "body_text" TEXT,
    "body_html" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_replies_gmail_message_id_key" ON "email_replies"("gmail_message_id");

-- CreateIndex
CREATE INDEX "email_replies_email_log_id_idx" ON "email_replies"("email_log_id");

-- CreateIndex
CREATE INDEX "email_replies_lead_id_idx" ON "email_replies"("lead_id");

-- AddForeignKey
ALTER TABLE "email_replies" ADD CONSTRAINT "email_replies_email_log_id_fkey" FOREIGN KEY ("email_log_id") REFERENCES "email_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
