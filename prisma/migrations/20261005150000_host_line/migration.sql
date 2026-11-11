-- AlterEnum
ALTER TYPE "VisitEventType" ADD VALUE 'HOST_NOTIFIED';

-- AlterTable
ALTER TABLE "Host" ADD COLUMN "lineUserId" TEXT,
ADD COLUMN "lineDisplayName" TEXT,
ADD COLUMN "lineLinkedAt" TIMESTAMP(3),
ADD COLUMN "lineLinkCode" TEXT,
ADD COLUMN "lineLinkCodeExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Host_lineUserId_key" ON "Host"("lineUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Host_lineLinkCode_key" ON "Host"("lineLinkCode");
