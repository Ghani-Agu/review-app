/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `Review` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."reviews_shop_product_status_idx";

-- AlterTable
ALTER TABLE "Review" DROP COLUMN "updatedAt",
ALTER COLUMN "status" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT,
    "userId" BIGINT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
