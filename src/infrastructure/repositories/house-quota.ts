import "server-only";
import type { HouseQuota } from "@/domain/org/house-quota";
import { prisma } from "../db/prisma";

/** จำนวนบ้านตามสัญญา + ที่ใช้อยู่ (บ้านที่เปิดใช้งานในสถานที่แบบหมู่บ้าน) */
export async function readHouseQuota(orgId: string): Promise<HouseQuota> {
  const [org, used] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { houseLimit: true } }),
    prisma.tenant.count({ where: { organizationId: orgId, isActive: true, site: { mode: "VILLAGE" } } }),
  ]);
  return { limit: org?.houseLimit ?? null, used };
}
