-- Calls soft-delete: non-null deleted_at = in trash.
ALTER TABLE "calls" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "calls_deleted_at_idx" ON "calls"("deleted_at");
