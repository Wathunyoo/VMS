-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING_REVIEW', 'PAID', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "checkInPointLimit" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "paidUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BillingProfile" (
    "organizationId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'สำนักงานใหญ่',
    "address" TEXT NOT NULL,
    "billingEmail" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "period" "BillingPeriod" NOT NULL,
    "points" INTEGER NOT NULL,
    "months" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "vat" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "withholding" DECIMAL(12,2) NOT NULL,
    "netPayable" DECIMAL(12,2) NOT NULL,
    "buyer" JSONB NOT NULL,
    "slipPath" TEXT,
    "slipUploadedAt" TIMESTAMP(3),
    "transferredAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "receiptNumber" TEXT,
    "paidAt" TIMESTAMP(3),
    "coverFrom" TIMESTAMP(3),
    "coverUntil" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CheckInPoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_receiptNumber_key" ON "Invoice"("receiptNumber");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_createdAt_idx" ON "Invoice"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CheckInPoint_tokenHash_key" ON "CheckInPoint"("tokenHash");

-- CreateIndex
CREATE INDEX "CheckInPoint_organizationId_revokedAt_idx" ON "CheckInPoint"("organizationId", "revokedAt");

-- AddForeignKey
ALTER TABLE "BillingProfile" ADD CONSTRAINT "BillingProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInPoint" ADD CONSTRAINT "CheckInPoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- องค์กรที่ใช้งานอยู่แล้ว (ACTIVE, ไม่มีวันหมดอายุ) = สัญญาพิเศษ ให้จำนวนจุดสูง
UPDATE "Organization" SET "checkInPointLimit" = 99 WHERE "status" = 'ACTIVE' AND "paidUntil" IS NULL;
