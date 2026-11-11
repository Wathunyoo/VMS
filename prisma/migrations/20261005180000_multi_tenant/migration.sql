-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'TRIAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- ข้อมูลเดิมทั้งหมดย้ายเข้าองค์กรเริ่มต้น
INSERT INTO "Organization" ("id", "slug", "name", "status", "updatedAt")
VALUES ('org_main', 'main', 'องค์กรของฉัน', 'ACTIVE', CURRENT_TIMESTAMP);

-- DropIndex
DROP INDEX "Host_lineUserId_key";

-- DropIndex
DROP INDEX "Site_code_key";

-- DropIndex
DROP INDEX "StaffUser_username_key";

-- DropIndex
DROP INDEX "Visit_passCode_key";

-- DropIndex
DROP INDEX "Visitor_idType_idNumberHash_key";

-- AlterTable
ALTER TABLE "DataPurgeLog" ADD COLUMN "organizationId" TEXT;
UPDATE "DataPurgeLog" SET "organizationId" = 'org_main';
ALTER TABLE "DataPurgeLog" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "FactorySafetyCheck" ADD COLUMN "organizationId" TEXT;
UPDATE "FactorySafetyCheck" SET "organizationId" = 'org_main';
ALTER TABLE "FactorySafetyCheck" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Host" ADD COLUMN "organizationId" TEXT;
UPDATE "Host" SET "organizationId" = 'org_main';
ALTER TABLE "Host" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "LoadingBay" ADD COLUMN "organizationId" TEXT;
UPDATE "LoadingBay" SET "organizationId" = 'org_main';
ALTER TABLE "LoadingBay" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "RetentionSetting" ADD COLUMN "organizationId" TEXT;
UPDATE "RetentionSetting" SET "organizationId" = 'org_main';
ALTER TABLE "RetentionSetting" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "RetentionSetting" DROP CONSTRAINT "RetentionSetting_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "RetentionSetting_pkey" PRIMARY KEY ("organizationId");

-- AlterTable
ALTER TABLE "Site" ADD COLUMN "organizationId" TEXT;
UPDATE "Site" SET "organizationId" = 'org_main';
ALTER TABLE "Site" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN "organizationId" TEXT;
UPDATE "StaffUser" SET "organizationId" = 'org_main';
ALTER TABLE "StaffUser" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "organizationId" TEXT;
UPDATE "Tenant" SET "organizationId" = 'org_main';
ALTER TABLE "Tenant" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "VehicleInfo" ADD COLUMN "organizationId" TEXT;
UPDATE "VehicleInfo" SET "organizationId" = 'org_main';
ALTER TABLE "VehicleInfo" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN "organizationId" TEXT;
UPDATE "Visit" SET "organizationId" = 'org_main';
ALTER TABLE "Visit" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "VisitEvent" ADD COLUMN "organizationId" TEXT;
UPDATE "VisitEvent" SET "organizationId" = 'org_main';
ALTER TABLE "VisitEvent" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Visitor" ADD COLUMN "organizationId" TEXT;
UPDATE "Visitor" SET "organizationId" = 'org_main';
ALTER TABLE "Visitor" ALTER COLUMN "organizationId" SET NOT NULL;



-- CreateIndex
CREATE INDEX "DataPurgeLog_organizationId_idx" ON "DataPurgeLog"("organizationId");

-- CreateIndex
CREATE INDEX "FactorySafetyCheck_organizationId_idx" ON "FactorySafetyCheck"("organizationId");

-- CreateIndex
CREATE INDEX "Host_organizationId_idx" ON "Host"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Host_organizationId_lineUserId_key" ON "Host"("organizationId", "lineUserId");

-- CreateIndex
CREATE INDEX "LoadingBay_organizationId_idx" ON "LoadingBay"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_organizationId_code_key" ON "Site"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_organizationId_username_key" ON "StaffUser"("organizationId", "username");

-- CreateIndex
CREATE INDEX "Tenant_organizationId_idx" ON "Tenant"("organizationId");

-- CreateIndex
CREATE INDEX "VehicleInfo_organizationId_idx" ON "VehicleInfo"("organizationId");

-- CreateIndex
CREATE INDEX "Visit_organizationId_status_checkInAt_idx" ON "Visit"("organizationId", "status", "checkInAt");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_organizationId_passCode_key" ON "Visit"("organizationId", "passCode");

-- CreateIndex
CREATE INDEX "VisitEvent_organizationId_idx" ON "VisitEvent"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_organizationId_idType_idNumberHash_key" ON "Visitor"("organizationId", "idType", "idNumberHash");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Host" ADD CONSTRAINT "Host_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadingBay" ADD CONSTRAINT "LoadingBay_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactorySafetyCheck" ADD CONSTRAINT "FactorySafetyCheck_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleInfo" ADD CONSTRAINT "VehicleInfo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitEvent" ADD CONSTRAINT "VisitEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionSetting" ADD CONSTRAINT "RetentionSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataPurgeLog" ADD CONSTRAINT "DataPurgeLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

