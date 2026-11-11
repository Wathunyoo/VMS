"use server";

import type { ActiveVisitItem, CheckOutPreview } from "@/application/check-out/check-out.types";
import {
  approveStampManually,
  approveStampWithOtp,
  CheckOutError,
  checkOutVisit,
  listActiveVisits,
  lookupVisit,
  type CheckOutResult,
} from "@/application/check-out/check-out.usecase";
import { checkOutDeps } from "@/container";
import { requireStaff } from "@/infrastructure/auth/session";
import { stationCheck } from "@/infrastructure/auth/station";

/** Check-out ทำได้เสมอแม้หมดรอบบริการ แต่ต้องเป็นจุด Check-in ที่ลงทะเบียน */
async function station() {
  const staff = await requireStaff();
  const st = await stationCheck(staff, "CHECK_OUT");
  return { staff, st };
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ทุก action เรียก requireStaff() นอก try เพื่อให้ redirect ไปหน้า login ทำงานได้
async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof CheckOutError) return { ok: false, error: e.message };
    console.error("[check-out]", e);
    return { ok: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
  }
}

export async function lookupVisitAction(ref: string): Promise<ActionResult<CheckOutPreview>> {
  const { staff, st } = await station();
  if (!st.ok) return { ok: false, error: st.message };
  return run(() => lookupVisit(String(ref ?? ""), checkOutDeps(staff.organizationId)));
}

export async function approveStampOtpAction(visitId: string, otp: string): Promise<ActionResult<CheckOutPreview>> {
  const { staff, st } = await station();
  if (!st.ok) return { ok: false, error: st.message };
  return run(() => approveStampWithOtp(String(visitId), String(otp ?? ""), checkOutDeps(staff.organizationId)));
}

export async function approveStampManualAction(visitId: string, reason: string): Promise<ActionResult<CheckOutPreview>> {
  const { staff, st } = await station();
  if (!st.ok) return { ok: false, error: st.message };
  return run(() => approveStampManually(String(visitId), String(reason ?? ""), checkOutDeps(staff.organizationId), staff.username));
}

export async function checkOutAction(visitId: string, weightOutKg?: number): Promise<ActionResult<CheckOutResult>> {
  const { staff, st } = await station();
  if (!st.ok) return { ok: false, error: st.message };
  return run(() =>
    checkOutVisit(
      String(visitId),
      { weightOutKg: weightOutKg == null ? undefined : Number(weightOutKg) },
      checkOutDeps(staff.organizationId),
      staff.username,
    ),
  );
}

export async function listActiveVisitsAction(): Promise<ActionResult<ActiveVisitItem[]>> {
  const staff = await requireStaff();
  return run(() => listActiveVisits(checkOutDeps(staff.organizationId)));
}
