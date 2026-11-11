"use server";

import type { StaffRole, StaffUserView } from "@/application/auth/auth.types";
import { AuthError, createStaff, listStaff, resetStaffPassword, setStaffActive, setStaffPoint } from "@/application/auth/auth.usecase";
import { authDeps } from "@/container";
import { requireAdmin } from "@/infrastructure/auth/session";

export type AdminResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<AdminResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error("[admin-users]", e);
    return { ok: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
  }
}

// requireAdmin() อยู่นอก try เพื่อให้ redirect ทำงานได้

export async function listStaffAction(): Promise<AdminResult<StaffUserView[]>> {
  const admin = await requireAdmin();
  return run(() => listStaff(admin, authDeps));
}

export async function createStaffAction(input: { username: string; fullName: string; role: StaffRole; checkInPointId?: string | null }) {
  const admin = await requireAdmin();
  return run(() =>
    createStaff(
      admin,
      {
        username: String(input.username),
        fullName: String(input.fullName),
        role: input.role,
        checkInPointId: input.checkInPointId ? String(input.checkInPointId) : null,
      },
      authDeps,
    ),
  );
}

export async function setStaffPointAction(userId: string, pointId: string | null) {
  const admin = await requireAdmin();
  return run(() => setStaffPoint(admin, String(userId), pointId ? String(pointId) : null, authDeps));
}

export async function resetPasswordAction(userId: string) {
  const admin = await requireAdmin();
  return run(() => resetStaffPassword(admin, String(userId), authDeps));
}

export async function setActiveAction(userId: string, active: boolean) {
  const admin = await requireAdmin();
  return run(() => setStaffActive(admin, String(userId), Boolean(active), authDeps));
}
