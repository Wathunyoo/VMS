import "server-only";
import type { CurrentStaff } from "@/application/auth/auth.types";
import { checkStation, claimPoint, type StationCheck } from "@/application/billing/devices.usecase";
import { deviceDeps } from "@/container";
import { platformOrgSlug } from "../billing/seller";
import { deviceToken, setDeviceCookie } from "./device-cookie";
import { requireStaff } from "./session";

/** เครื่องนี้ทำ Check-in / Check-out ให้องค์กรของผู้ใช้ได้ไหม (อุปกรณ์ลงทะเบียน + โควตา + สิทธิ์ใช้งาน) */
export async function stationCheck(staff: CurrentStaff, purpose: "CHECK_IN" | "CHECK_OUT"): Promise<StationCheck> {
  return checkStation(await deviceToken(), purpose, deviceDeps(staff.organizationId));
}

/**
 * เจ้าหน้าที่ประจำจุดเข้าระบบ → เครื่องนี้กลายเป็นจุดนั้นทันที (ถ้ายังไม่ใช่)
 * จุดหนึ่งผูกได้ 1 เครื่อง — เครื่องเดิมของจุดนั้นจะต้องให้เจ้าหน้าที่เข้าระบบใหม่
 */
export async function bindAssignedPoint(user: Pick<CurrentStaff, "organizationId" | "checkInPointId">): Promise<void> {
  if (!user.checkInPointId) return;
  const deps = deviceDeps(user.organizationId);
  const token = await deviceToken();
  const current = token ? await deps.devices.findActive(deps.tokens.hash(token)) : null;
  if (current?.id === user.checkInPointId) return;
  const fresh = await claimPoint(user.checkInPointId, deps);
  if (fresh) await setDeviceCookie(fresh);
}

/** ผู้ดูแลขององค์กรผู้ให้บริการ (PLATFORM_ORG_SLUG) — ตรวจสลิปของลูกค้าได้ */
export async function requirePlatformAdmin(): Promise<CurrentStaff> {
  const user = await requireStaff();
  if (user.role !== "ADMIN" || user.orgSlug !== platformOrgSlug()) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return user;
}

export function isPlatformAdmin(user: Pick<CurrentStaff, "role" | "orgSlug">) {
  return user.role === "ADMIN" && user.orgSlug === platformOrgSlug();
}
