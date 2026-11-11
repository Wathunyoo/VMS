"use server";

import { BillingError } from "@/application/billing/billing.usecase";
import { claimPoint, createPoint, registerDevice, revokeDevice } from "@/application/billing/devices.usecase";
import { deviceDeps } from "@/container";
import { clearDeviceCookie, setDeviceCookie } from "@/infrastructure/auth/device-cookie";
import { requireOrgAdmin as requireAdmin } from "@/infrastructure/auth/session";

type Result = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    if (e instanceof BillingError) return { ok: false, error: e.message };
    console.error("[devices]", e);
    return { ok: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
  }
}

/** ลงทะเบียน "เครื่องที่กำลังใช้อยู่นี้" เป็นจุด Check-in */
export async function registerThisDeviceAction(name: string): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => setDeviceCookie(await registerDevice(admin, String(name ?? ""), deviceDeps(admin.organizationId))));
}

/** สร้างจุด Check-in ไว้ก่อน (ไม่ต้องอยู่ที่เครื่อง) */
export async function createPointAction(name: string): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => createPoint(admin, String(name ?? ""), deviceDeps(admin.organizationId)));
}

/** ใช้เครื่องที่กำลังเปิดหน้านี้เป็นจุดที่เลือก (เครื่องเดิมของจุดนั้นหลุด) */
export async function bindThisDeviceAction(pointId: string): Promise<Result> {
  const admin = await requireAdmin();
  return run(async () => {
    const token = await claimPoint(String(pointId), deviceDeps(admin.organizationId));
    if (!token) throw new BillingError("ไม่พบจุด Check-in นี้");
    await setDeviceCookie(token);
  });
}

export async function revokeDeviceAction(id: string): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => revokeDevice(admin, String(id), deviceDeps(admin.organizationId)));
}

export async function forgetThisDeviceAction(): Promise<Result> {
  await requireAdmin();
  await clearDeviceCookie();
  return { ok: true };
}
