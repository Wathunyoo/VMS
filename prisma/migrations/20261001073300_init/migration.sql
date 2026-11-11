-- CreateEnum
CREATE TYPE "SiteMode" AS ENUM ('OFFICE', 'FACTORY');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PENDING_APPROVAL', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitPurpose" AS ENUM ('INTERVIEW', 'MEETING', 'DELIVERY', 'MAINTENANCE', 'CONTRACTOR_WORK', 'CARGO', 'OTHER');

-- CreateEnum
CREATE TYPE "IdDocumentType" AS ENUM ('NATIONAL_ID', 'DRIVER_LICENSE', 'PASSPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "StampStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StampMethod" AS ENUM ('WEB_LINK', 'OTP', 'MANUAL');

-- CreateEnum
CREATE TYPE "HighRiskWork" AS ENUM ('HOT_WORK', 'CONFINED_SPACE', 'WORKING_AT_HEIGHTS', 'ELECTRICAL', 'CHEMICAL', 'LIFTING');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'MOTORCYCLE', 'PICKUP', 'VAN', 'TRUCK_4W', 'TRUCK_6W', 'TRUCK_10W', 'TRAILER', 'OTHER');

-- CreateEnum
CREATE TYPE "VisitEventType" AS ENUM ('CHECK_IN', 'STAMP_REQUESTED', 'STAMP_APPROVED', 'STAMP_REJECTED', 'OVERSTAY_ALERT', 'CHECK_OUT', 'PASS_REPRINTED');

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "SiteMode" NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "defaultMaxStayMinutes" INTEGER NOT NULL DEFAULT 480,
    "parkingFreeMinutes" INTEGER NOT NULL DEFAULT 120,
    "parkingRatePerHour" DECIMAL(10,2) NOT NULL DEFAULT 30,
    "parkingGraceMinutes" INTEGER NOT NULL DEFAULT 15,
    "parkingDailyCap" DECIMAL(10,2),
    "inductionVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floor" TEXT NOT NULL,
    "unit" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Host" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "tenantId" TEXT,
    "fullName" TEXT NOT NULL,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Host_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadingBay" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LoadingBay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "idType" "IdDocumentType" NOT NULL,
    "idNumberHash" TEXT NOT NULL,
    "idNumberMasked" TEXT NOT NULL,
    "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
    "blacklistNote" TEXT,
    "pdpaConsentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "passCode" TEXT NOT NULL,
    "badgeNumber" TEXT,
    "siteId" TEXT NOT NULL,
    "mode" "SiteMode" NOT NULL,
    "visitorId" TEXT NOT NULL,
    "hostId" TEXT,
    "tenantId" TEXT,
    "purpose" "VisitPurpose" NOT NULL,
    "purposeNote" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'CHECKED_IN',
    "facePhotoUrl" TEXT,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedCheckOutAt" TIMESTAMP(3) NOT NULL,
    "checkOutAt" TIMESTAMP(3),
    "timeSpentMinutes" INTEGER,
    "overstayMinutes" INTEGER,
    "stampStatus" "StampStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "stampMethod" "StampMethod",
    "stampToken" TEXT,
    "stampOtpHash" TEXT,
    "stampOtpExpiresAt" TIMESTAMP(3),
    "stampedAt" TIMESTAMP(3),
    "stampedBy" TEXT,
    "parkingFreeMinutes" INTEGER,
    "parkingFee" DECIMAL(10,2),
    "checkedInBy" TEXT,
    "checkedOutBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactorySafetyCheck" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "ppeHelmet" BOOLEAN NOT NULL DEFAULT false,
    "ppeSafetyShoes" BOOLEAN NOT NULL DEFAULT false,
    "ppeReflectiveVest" BOOLEAN NOT NULL DEFAULT false,
    "ppeSafetyGlasses" BOOLEAN NOT NULL DEFAULT false,
    "ppeEarProtection" BOOLEAN NOT NULL DEFAULT false,
    "ppeGloves" BOOLEAN NOT NULL DEFAULT false,
    "highRiskWorks" "HighRiskWork"[],
    "workPermitId" TEXT,
    "inductionCompleted" BOOLEAN NOT NULL DEFAULT false,
    "inductionVersion" TEXT,
    "inductionAckAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactorySafetyCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleInfo" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "plateProvince" TEXT,
    "vehicleType" "VehicleType" NOT NULL,
    "platePhotoUrl" TEXT,
    "driverName" TEXT,
    "loadingBayId" TEXT,
    "cargoDescription" TEXT,
    "sealNumber" TEXT,
    "weightInKg" DECIMAL(12,2),
    "weightOutKg" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitEvent" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "type" "VisitEventType" NOT NULL,
    "actor" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_code_key" ON "Site"("code");

-- CreateIndex
CREATE INDEX "Tenant_siteId_floor_idx" ON "Tenant"("siteId", "floor");

-- CreateIndex
CREATE INDEX "Tenant_siteId_name_idx" ON "Tenant"("siteId", "name");

-- CreateIndex
CREATE INDEX "Host_siteId_fullName_idx" ON "Host"("siteId", "fullName");

-- CreateIndex
CREATE INDEX "Host_tenantId_idx" ON "Host"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LoadingBay_siteId_code_key" ON "LoadingBay"("siteId", "code");

-- CreateIndex
CREATE INDEX "Visitor_fullName_idx" ON "Visitor"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_idType_idNumberHash_key" ON "Visitor"("idType", "idNumberHash");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_passCode_key" ON "Visit"("passCode");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_stampToken_key" ON "Visit"("stampToken");

-- CreateIndex
CREATE INDEX "Visit_siteId_status_checkInAt_idx" ON "Visit"("siteId", "status", "checkInAt");

-- CreateIndex
CREATE INDEX "Visit_visitorId_idx" ON "Visit"("visitorId");

-- CreateIndex
CREATE INDEX "Visit_hostId_idx" ON "Visit"("hostId");

-- CreateIndex
CREATE UNIQUE INDEX "FactorySafetyCheck_visitId_key" ON "FactorySafetyCheck"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleInfo_visitId_key" ON "VehicleInfo"("visitId");

-- CreateIndex
CREATE INDEX "VehicleInfo_plateNumber_idx" ON "VehicleInfo"("plateNumber");

-- CreateIndex
CREATE INDEX "VisitEvent_visitId_createdAt_idx" ON "VisitEvent"("visitId", "createdAt");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Host" ADD CONSTRAINT "Host_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Host" ADD CONSTRAINT "Host_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadingBay" ADD CONSTRAINT "LoadingBay_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactorySafetyCheck" ADD CONSTRAINT "FactorySafetyCheck_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleInfo" ADD CONSTRAINT "VehicleInfo_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleInfo" ADD CONSTRAINT "VehicleInfo_loadingBayId_fkey" FOREIGN KEY ("loadingBayId") REFERENCES "LoadingBay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitEvent" ADD CONSTRAINT "VisitEvent_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
