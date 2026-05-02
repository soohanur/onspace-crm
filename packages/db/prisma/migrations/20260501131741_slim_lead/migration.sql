/*
  Warnings:

  - You are about to drop the column `brands` on the `leads` table. All the data in the column will be lost.
  - You are about to drop the column `hours_of_operation` on the `leads` table. All the data in the column will be lost.
  - You are about to drop the column `languages` on the `leads` table. All the data in the column will be lost.
  - You are about to drop the column `payment_methods` on the `leads` table. All the data in the column will be lost.
  - You are about to drop the column `reviews` on the `leads` table. All the data in the column will be lost.
  - You are about to drop the column `services` on the `leads` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "leads" DROP COLUMN "brands",
DROP COLUMN "hours_of_operation",
DROP COLUMN "languages",
DROP COLUMN "payment_methods",
DROP COLUMN "reviews",
DROP COLUMN "services";
