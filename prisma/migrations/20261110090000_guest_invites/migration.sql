-- แจ้งแขกล่วงหน้า: ลูกบ้าน/Host สร้าง QR ส่งให้แขก แขกแสดง QR ที่จุด รปภ.
CREATE TYPE "GuestInviteStatus" AS ENUM ('ACTIVE', 'USED', 'CANCELLED');

CREATE TABLE "GuestInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "tenantId" TEXT,
    "hostId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "guestName" TEXT,
    "plateNumber" TEXT,
    "note" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "GuestInviteStatus" NOT NULL DEFAULT 'ACTIVE',
    "usedAt" TIMESTAMP(3),
    "visitId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestInvite_token_key" ON "GuestInvite"("token");
CREATE UNIQUE INDEX "GuestInvite_visitId_key" ON "GuestInvite"("visitId");
CREATE INDEX "GuestInvite_organizationId_validFrom_idx" ON "GuestInvite"("organizationId", "validFrom");
CREATE INDEX "GuestInvite_hostId_validUntil_idx" ON "GuestInvite"("hostId", "validUntil");

ALTER TABLE "GuestInvite" ADD CONSTRAINT "GuestInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestInvite" ADD CONSTRAINT "GuestInvite_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestInvite" ADD CONSTRAINT "GuestInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestInvite" ADD CONSTRAINT "GuestInvite_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestInvite" ADD CONSTRAINT "GuestInvite_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
