/*
  Warnings:

  - You are about to drop the column `social` on the `leads` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "leads" DROP COLUMN "social",
ADD COLUMN     "socials" TEXT[] DEFAULT ARRAY[]::TEXT[];
