import "server-only";
import type { SiteMode } from "@/domain/visit/types";
import { prisma } from "../db/prisma";
import { db } from "../db/tenant";

/**
 * โหมดขององค์กร (1 องค์กร = 1 โหมด) — เลือกตอนตั้งค่าเริ่มต้น
 * องค์กรที่ยังไม่ได้บันทึกโหมด ใช้โหมดของสถานที่แรก · ยังไม่มีสถานที่ = null
 */
export async function organizationMode(orgId: string): Promise<SiteMode | null> {
  const o = await prisma.organization.findUnique({ where: { id: orgId }, select: { siteMode: true } });
  if (o?.siteMode) return o.siteMode;
  const s = await db(orgId).site.findFirst({ orderBy: { createdAt: "asc" }, select: { mode: true } });
  return s?.mode ?? null;
}
