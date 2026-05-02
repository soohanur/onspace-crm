-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "stage_changed_at" TIMESTAMP(3);

-- Backfill: every existing lead is treated as having entered its current
-- stage at row creation time. Rule 4 (push-followup) needs a non-null
-- timestamp to compute "has been in no_response for >3 days".
UPDATE leads SET stage_changed_at = created_at WHERE stage_changed_at IS NULL;
