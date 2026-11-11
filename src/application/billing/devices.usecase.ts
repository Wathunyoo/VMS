import { computeAccess } from "@/domain/billing/access";
import type { CurrentStaff } from "../auth/auth.types";
import type { BillingRepository, DeviceRepository } from "./billing.types";
import { BillingError } from "./billing.usecase";

export interface DeviceDeps {
  repo: BillingRepository;
  devices: DeviceRepository;
  tokens: { create(): { token: string; hash: string }; hash(t: string): string };
  now?: () => Date;
}

async function checkNewPoint(actor: CurrentStaff, name: string, deps: DeviceDeps): Promise<string> {
  if (actor.role !== "ADMIN") throw new BillingError("เฉพาะผู้ดูแลระบบ");
  const n = name.trim();
  if (n.length < 2 || n.length > 60) throw new BillingError("กรุณาตั้งชื่อจุด เช่น ป้อม รปภ. ประตู 1");
  const access = computeAccess(await deps.repo.org(), deps.now?.() ?? new Date());
  if ((await deps.devices.activeCount()) >= access.pointLimit) {
    throw new BillingError(`สัญญาปัจจุบันใช้ได้ ${access.pointLimit} จุด — ยกเลิกจุดที่ไม่ใช้ หรือติดต่อผู้ให้บริการเพื่อเพิ่มจำนวนจุด`);
  }
  return n;
}

/** ลงทะเบียนเครื่องนี้เป็นจุด Check-in — คืน token ไปเก็บใน cookie ของเครื่อง */
export async function registerDevice(actor: CurrentStaff, name: string, deps: DeviceDeps) {
  const n = await checkNewPoint(actor, name, deps);
  const { token, hash } = deps.tokens.create();
  await deps.devices.register(n, hash, actor.username);
  return token;
}

/** สร้างจุด Check-in ไว้ก่อน (ยังไม่มีเครื่อง) — เครื่องที่เจ้าหน้าที่ประจำจุดเข้าระบบจะกลายเป็นจุดนี้ */
export async function createPoint(actor: CurrentStaff, name: string, deps: DeviceDeps): Promise<string> {
  const n = await checkNewPoint(actor, name, deps);
  return deps.devices.register(n, null, actor.username);
}

/**
 * ผูกเครื่องที่กำลังใช้กับจุดที่มีอยู่ — คืน token ใหม่ให้เก็บใน cookie (เครื่องเดิมของจุดนั้นหลุด)
 * ใช้ตอนผู้ดูแลกด "ใช้เครื่องนี้เป็นจุดนี้" และตอนเจ้าหน้าที่ประจำจุดเข้าระบบ
 */
export async function claimPoint(pointId: string, deps: DeviceDeps): Promise<string | null> {
  const { token, hash } = deps.tokens.create();
  return (await deps.devices.claim(pointId, hash)) ? token : null;
}

export async function revokeDevice(actor: CurrentStaff, id: string, deps: DeviceDeps) {
  if (actor.role !== "ADMIN") throw new BillingError("เฉพาะผู้ดูแลระบบ");
  if (!(await deps.devices.revoke(id, deps.now?.() ?? new Date()))) throw new BillingError("ไม่พบจุด Check-in");
}

export type StationCheck =
  | { ok: true; device: { id: string; name: string } }
  | { ok: false; reason: "NO_DEVICE" | "OVER_LIMIT" | "BILLING"; message: string };

/**
 * เครื่องนี้ทำรายการได้ไหม
 *  - ต้องเป็นอุปกรณ์ที่ลงทะเบียน และอยู่ในโควตา (เครื่องที่ลงทะเบียนก่อนได้สิทธิ์ก่อน)
 *  - Check-in ต้องมีสิทธิ์ใช้งาน (ไม่หมดอายุ); Check-out ทำได้เสมอ
 */
export async function checkStation(token: string | null, purpose: "CHECK_IN" | "CHECK_OUT", deps: DeviceDeps): Promise<StationCheck> {
  const now = deps.now?.() ?? new Date();
  const device = token ? await deps.devices.findActive(deps.tokens.hash(token)) : null;
  if (!device) {
    return { ok: false, reason: "NO_DEVICE", message: "เครื่องนี้ยังไม่ได้ลงทะเบียนเป็นจุด Check-in — ให้ผู้ดูแลระบบลงทะเบียนที่เมนู \"จุด Check-in\"" };
  }
  const access = computeAccess(await deps.repo.org(), now);
  if (device.rank >= access.pointLimit) {
    return { ok: false, reason: "OVER_LIMIT", message: `จุด Check-in เกินจำนวนตามสัญญา (${access.pointLimit} จุด) — ติดต่อผู้ดูแลระบบ` };
  }
  if (purpose === "CHECK_IN" && !access.canCheckIn) {
    return { ok: false, reason: "BILLING", message: access.message ?? "ไม่สามารถ Check-in ได้" };
  }
  await deps.devices.touch(device.id, now);
  return { ok: true, device: { id: device.id, name: device.name } };
}
