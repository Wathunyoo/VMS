-- CreateEnum
CREATE TYPE "PurgeTrigger" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "Visitor" ADD COLUMN "purgedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RetentionSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "photoDays" INTEGER NOT NULL DEFAULT 90,
    "personalDataDays" INTEGER NOT NULL DEFAULT 365,
    "autoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataPurgeLog" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" "PurgeTrigger" NOT NULL,
    "actor" TEXT,
    "photoDays" INTEGER NOT NULL,
    "personalDataDays" INTEGER NOT NULL,
    "photosDeleted" INTEGER NOT NULL,
    "visitorsAnonymized" INTEGER NOT NULL,
    "vehiclesAnonymized" INTEGER NOT NULL,
    "visitsCleaned" INTEGER NOT NULL,
    "error" TEXT,

    CONSTRAINT "DataPurgeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataPurgeLog_ranAt_idx" ON "DataPurgeLog"("ranAt");
