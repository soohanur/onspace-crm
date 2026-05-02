-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "banner_url" TEXT,
ADD COLUMN     "brands" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "business_history" TEXT,
ADD COLUMN     "claimed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "neighborhoods" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "other_links" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "reviews" JSONB,
ADD COLUMN     "years_with_yp" INTEGER;
