-- CreateTable
CREATE TABLE "lead_stage_history" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "from_stage" "LeadStage" NOT NULL,
    "to_stage" "LeadStage" NOT NULL,
    "trigger" TEXT NOT NULL,
    "actor_label" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_stage_history_lead_id_occurred_at_idx" ON "lead_stage_history"("lead_id", "occurred_at");

-- CreateIndex
CREATE INDEX "lead_stage_history_occurred_at_idx" ON "lead_stage_history"("occurred_at");

-- AddForeignKey
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

