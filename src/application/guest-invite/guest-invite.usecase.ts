import {
  INVITE_MAX_OPEN_PER_HOST,
  INVITE_STATE_TEXT,
  inviteProblem,
  inviteShareText,
  inviteState,
  inviteTimeText,
  inviteWindowText,
  toBangkokLocal,
  validateInviteInput,
} from "@/domain/invite/guest-invite";
import { visitingText } from "@/domain/visit/labels";
import type {
  InviteRecord,
  InviteView,
  PublicInviteRepository,
  ResidentInviteView,
  ResidentPageView,
  ResidentRecord,
  StaffInviteRepository,
} from "./guest-invite.types";

export class InviteError extends Error {}

export interface ResidentInviteDeps {
  invites: PublicInviteRepository;
  /** ตรวจลิงก์ "แจ้งแขก" → host id + แท็กบัญชี LINE */
  verifyResidentToken: (token: string, now: Date) => { h: string; u: string } | null;
  lineUserTag: (lineUserId: string) => string;
  newInviteToken: () => string;
  appUrl: string;
  now?: () => Date;
}

export interface StaffInviteDeps {
  invites: StaffInviteRepository;
  now?: () => Date;
}

export const LINK_EXPIRED = "ลิงก์นี้หมดอายุหรือไม่ถูกต้อง — พิมพ์ “แจ้งแขก” ใน LINE เพื่อขอลิงก์ใหม่";

const placeOf = (r: { mode: InviteRecord["mode"]; tenant: InviteRecord["tenant"]; siteName: string }) =>
  r.tenant ? visitingText(r.mode, r.tenant) : r.siteName;

export function toInviteView(r: InviteRecord, now: Date): InviteView {
  const state = inviteState(r, now);
  return {
    id: r.id,
    siteId: r.siteId,
    siteName: r.siteName,
    mode: r.mode,
    tenantId: r.tenantId,
    hostId: r.hostId,
    hostName: r.hostName,
    placeText: placeOf(r),
    guestName: r.guestName,
    plateNumber: r.plateNumber,
    note: r.note,
    windowText: inviteWindowText(r.validFrom, r.validUntil),
    startsAt: r.validFrom.toISOString(),
    state,
    stateText: INVITE_STATE_TEXT[state],
    problem: inviteProblem(state, inviteTimeText(r.validFrom)),
  };
}

function toResidentView(r: InviteRecord, now: Date, appUrl: string): ResidentInviteView {
  const v = toInviteView(r, now);
  const guestUrl = `${appUrl}/g/${r.token}`;
  return { ...v, guestUrl, shareText: inviteShareText({ placeText: v.placeText, windowText: v.windowText, plateNumber: v.plateNumber, url: guestUrl }) };
}

/** ตรวจลิงก์ของลูกบ้าน — ยังเป็นรายชื่อที่ใช้งานอยู่ และยังผูกกับบัญชี LINE เดิม */
async function openResident(token: string, deps: ResidentInviteDeps, now: Date): Promise<ResidentRecord> {
  const p = deps.verifyResidentToken(token, now);
  if (!p) throw new InviteError(LINK_EXPIRED);
  const r = await deps.invites.findResident(p.h);
  if (!r || !r.isActive || !r.lineUserId || deps.lineUserTag(r.lineUserId) !== p.u) throw new InviteError(LINK_EXPIRED);
  if (r.orgSuspended) throw new InviteError("ระบบของหมู่บ้าน/อาคารนี้ระงับการใช้งานชั่วคราว — ติดต่อนิติบุคคล/ผู้ดูแล");
  if (r.mode === "FACTORY") throw new InviteError("การแจ้งแขกล่วงหน้ายังไม่รองรับโหมดโรงงาน");
  return r;
}

const HISTORY_MS = 24 * 3600_000;

export async function residentPage(token: string, deps: ResidentInviteDeps): Promise<ResidentPageView> {
  const now = deps.now?.() ?? new Date();
  const r = await openResident(token, deps, now);
  const invites = await deps.invites.listForHost(r.id, new Date(now.getTime() - HISTORY_MS));
  // ค่าเริ่มต้น: ตอนนี้ (ปัดขึ้นเป็นครึ่งชั่วโมง) ถึงอีก 3 ชั่วโมง
  const start = new Date(Math.ceil(now.getTime() / 1_800_000) * 1_800_000);
  return {
    hostName: r.fullName,
    placeText: placeOf({ mode: r.mode, tenant: r.tenant, siteName: r.siteName }),
    siteName: r.siteName,
    invites: invites.map((i) => toResidentView(i, now, deps.appUrl)),
    defaults: { validFrom: toBangkokLocal(start), validUntil: toBangkokLocal(new Date(start.getTime() + 3 * 3600_000)) },
  };
}

export type CreateInviteResult = { ok: true; invite: ResidentInviteView } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function createGuestInvite(token: string, raw: Record<string, unknown>, deps: ResidentInviteDeps): Promise<CreateInviteResult> {
  const now = deps.now?.() ?? new Date();
  const r = await openResident(token, deps, now);
  const v = validateInviteInput(raw, now);
  if (!v.ok) return { ok: false, error: "กรุณาตรวจสอบข้อมูล", fieldErrors: v.errors };
  if ((await deps.invites.countOpen(r.id, now)) >= INVITE_MAX_OPEN_PER_HOST) {
    return { ok: false, error: `มีรายการที่ยังไม่หมดเวลาครบ ${INVITE_MAX_OPEN_PER_HOST} รายการแล้ว — ยกเลิกรายการเก่าก่อน` };
  }
  const invite = await deps.invites.create(r, v.value, deps.newInviteToken());
  return { ok: true, invite: toResidentView(invite, now, deps.appUrl) };
}

export async function cancelGuestInvite(token: string, inviteId: string, deps: ResidentInviteDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const r = await openResident(token, deps, now);
  if (!(await deps.invites.cancel(r.id, inviteId, now))) throw new InviteError("ยกเลิกไม่ได้ — รายการนี้ถูกใช้หรือยกเลิกไปแล้ว");
}

/** หน้าของแขก (เปิดจากลิงก์ที่ลูกบ้านส่งให้) */
export async function guestPass(token: string, deps: Pick<ResidentInviteDeps, "invites" | "now">): Promise<InviteView | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const r = await deps.invites.findByToken(token);
  return r && toInviteView(r, deps.now?.() ?? new Date());
}

// ---------------- จุด รปภ. ----------------

/** สแกน QR ของแขก (token) หรือเลือกจากรายการ (id) */
export async function lookupInviteForCheckIn(ref: { token?: string; id?: string }, deps: StaffInviteDeps): Promise<InviteView> {
  const r = ref.token ? await deps.invites.findByToken(ref.token) : ref.id ? await deps.invites.findById(ref.id) : null;
  // QR ขององค์กรอื่น = ไม่พบ (ไม่บอกว่ามีอยู่)
  if (!r) throw new InviteError("ไม่พบ QR นี้ในระบบ — อาจเป็น QR ของที่อื่น หรือถูกลบไปแล้ว");
  return toInviteView(r, deps.now?.() ?? new Date());
}

/** แขกที่แจ้งไว้วันนี้ (ยังไม่มาถึง) — ให้ รปภ. เลือกได้เมื่อแขกเปิด QR ไม่ได้ */
export async function listInvitesForCheckIn(deps: StaffInviteDeps): Promise<InviteView[]> {
  const now = deps.now?.() ?? new Date();
  const endOfDay = new Date(`${toBangkokLocal(now).slice(0, 10)}T23:59:59+07:00`);
  const rows = await deps.invites.listActiveBetween(now, endOfDay);
  return rows.map((r) => toInviteView(r, now));
}
