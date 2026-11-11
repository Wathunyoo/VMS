-- โหมดหมู่บ้าน + แบบฟอร์มปรับแต่งได้
ALTER TYPE "SiteMode" ADD VALUE 'VILLAGE';
ALTER TYPE "VisitPurpose" ADD VALUE 'GUEST';
ALTER TYPE "VisitPurpose" ADD VALUE 'FOOD_DELIVERY';

ALTER TABLE "Visit" ADD COLUMN "customValues" JSONB;

CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'SELECT', 'CHECKBOX');

CREATE TABLE "FormSetting" (
    "organizationId" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "disabledPurposes" "VisitPurpose"[],
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FormSetting_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "modes" "SiteMode"[],
    "showOnPass" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomField_organizationId_sortOrder_idx" ON "CustomField"("organizationId", "sortOrder");

ALTER TABLE "FormSetting" ADD CONSTRAINT "FormSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- รายงานค้นตามช่วงเวลา
CREATE INDEX "Visit_organizationId_checkInAt_idx" ON "Visit"("organizationId", "checkInAt");
