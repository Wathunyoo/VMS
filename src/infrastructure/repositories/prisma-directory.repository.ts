import "server-only";
import { db } from "../db/tenant";
import { organizationMode } from "./org-mode";

/** Read models สำหรับหน้า Check-in (Directory / Loading bays) */
/** สถานที่สำหรับหน้า Check-in — เฉพาะโหมดขององค์กร */
export async function getCheckInDirectory(orgId: string) {
  const mode = await organizationMode(orgId);
  const sites = await db(orgId).site.findMany({
    where: mode ? { mode } : {},
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      mode: true,
      defaultMaxStayMinutes: true,
      inductionVersion: true,
      tenants: {
        where: { isActive: true },
        orderBy: [{ floor: "asc" }, { name: "asc" }],
        select: { id: true, name: true, floor: true, unit: true },
      },
      hosts: {
        where: { isActive: true },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, department: true, tenantId: true },
      },
      loadingBays: {
        where: { isActive: true },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, zone: true },
      },
    },
  });
  return sites;
}

export type CheckInDirectory = Awaited<ReturnType<typeof getCheckInDirectory>>;

export async function getVisitForPass(orgId: string, visitId: string) {
  return db(orgId).visit.findUnique({
    where: { id: visitId },
    include: {
      site: { select: { name: true, mode: true } },
      visitor: { select: { fullName: true, company: true, idType: true, idNumberMasked: true } },
      host: { select: { fullName: true, department: true } },
      tenant: { select: { name: true, floor: true, unit: true } },
      vehicle: { include: { loadingBay: { select: { code: true, name: true } } } },
      safetyCheck: true,
    },
  });
}
