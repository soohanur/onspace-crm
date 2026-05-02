-- CreateTable
CREATE TABLE "email_pixel_hits" (
    "id" TEXT NOT NULL,
    "email_log_id" TEXT NOT NULL,
    "tracking_id" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "suspected_prefetch" BOOLEAN NOT NULL DEFAULT false,
    "hit_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_pixel_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_pixel_hits_email_log_id_hit_at_idx" ON "email_pixel_hits"("email_log_id", "hit_at");

-- CreateIndex
CREATE INDEX "email_pixel_hits_tracking_id_idx" ON "email_pixel_hits"("tracking_id");
