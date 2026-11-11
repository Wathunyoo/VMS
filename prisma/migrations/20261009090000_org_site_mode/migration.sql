-- 1 องค์กร = 1 โหมด (อาคารสำนักงาน / โรงงาน / หมู่บ้าน)
ALTER TABLE "Organization" ADD COLUMN "siteMode" "SiteMode";

-- องค์กรเดิม: ใช้โหมดของสถานที่แรก
UPDATE "Organization" o SET "siteMode" = s."mode"
FROM (
  SELECT DISTINCT ON ("organizationId") "organizationId", "mode"
  FROM "Site" ORDER BY "organizationId", "createdAt" ASC
) s
WHERE s."organizationId" = o."id" AND o."siteMode" IS NULL;
