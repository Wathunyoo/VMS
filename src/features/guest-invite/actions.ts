"use server";

import type { InviteView, ResidentInviteView } from "@/application/guest-invite/guest-invite.types";
import {
  cancelGuestInvite,
  createGuestInvite,
  InviteError,
  listInvitesForCheckIn,
  lookupInviteForCheckIn,
  residentPage,
  type CreateInviteResult,
} from "@/application/guest-invite/guest-invite.usecase";
import { residentInviteDeps, staffInviteDeps } from "@/container";
import { extractInviteToken } from "@/domain/invite/guest-invite";
import { requireStaff } from "@/infrastructure/auth/session";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof InviteError) return { ok: false, error: e.message };
    console.error("[guest-invite]", e);
    return { ok: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
  }
}

// ---------- หน้าของลูกบ้าน (สิทธิ์มาจากลิงก์ที่เซ็นแล้ว ไม่ต้อง login) ----------

export async function createInviteAction(token: string, raw: Record<string, string>): Promise<CreateInviteResult> {
  const input = {
    guestName: String(raw?.guestName ?? ""),
    plateNumber: String(raw?.plateNumber ?? ""),
    note: String(raw?.note ?? ""),
    validFrom: String(raw?.validFrom ?? ""),
    validUntil: String(raw?.validUntil ?? ""),
  };
  const r = await run(() => createGuestInvite(String(token), input, residentInviteDeps()));
  return r.ok ? r.data : { ok: false, error: r.error };
}

export async function cancelInviteAction(token: string, inviteId: string): Promise<Result<ResidentInviteView[]>> {
  return run(async () => {
    const deps = residentInviteDeps();
    await cancelGuestInvite(String(token), String(inviteId), deps);
    return (await residentPage(String(token), deps)).invites;
  });
}

export async function refreshResidentInvitesAction(token: string): Promise<Result<ResidentInviteView[]>> {
  return run(async () => (await residentPage(String(token), residentInviteDeps())).invites);
}

// ---------- จุด รปภ. ----------

/** ค่าที่สแกนได้จาก QR ของแขก หรือ id จากรายการ */
export async function lookupInviteAction(ref: { scanned?: string; id?: string }): Promise<Result<InviteView>> {
  const staff = await requireStaff();
  const token = ref.scanned ? extractInviteToken(String(ref.scanned)) : undefined;
  if (ref.scanned && !token) return { ok: false, error: "QR นี้ไม่ใช่ QR แจ้งแขกล่วงหน้า" };
  return run(() => lookupInviteForCheckIn({ token: token ?? undefined, id: ref.id ? String(ref.id) : undefined }, staffInviteDeps(staff.organizationId)));
}

export async function listTodayInvitesAction(): Promise<Result<InviteView[]>> {
  const staff = await requireStaff();
  return run(() => listInvitesForCheckIn(staffInviteDeps(staff.organizationId)));
}
