/**
 * แจ้งแขกล่วงหน้า — ลูกบ้าน/Host ระบุช่วงเวลาและทะเบียนรถ ระบบออก QR ให้ส่งต่อแขก
 * เวลาทั้งหมดเป็นเวลาไทย (UTC+7 ไม่มี daylight saving)
 */

/** แขกมาก่อนเวลาที่แจ้งได้ไม่เกินกี่นาที */
export const INVITE_EARLY_MINUTES = 60;
/** ช่วงเวลาหนึ่งรายการยาวได้ไม่เกิน (วัน) */
export const INVITE_MAX_SPAN_DAYS = 7;
/** แจ้งล่วงหน้าได้ไม่เกิน (วัน) */
export const INVITE_MAX_AHEAD_DAYS = 60;
/** รายการที่ยังไม่หมดเวลาต่อ 1 คน */
export const INVITE_MAX_OPEN_PER_HOST = 30;
/** ลิงก์ "แจ้งแขก" ที่ส่งทาง LINE ใช้ได้นาน */
export const RESIDENT_LINK_TTL_MS = 24 * 3600_000;

const TZ_OFFSET = "+07:00";
const DAY = 86_400_000;

export type GuestInviteStatus = "ACTIVE" | "USED" | "CANCELLED";
/** สถานะที่ใช้แสดงผล/ตัดสินว่า Check-in ได้หรือไม่ */
export type InviteState = "OPEN" | "NOT_YET" | "EXPIRED" | "USED" | "CANCELLED";

export interface InviteTiming {
  status: GuestInviteStatus;
  validFrom: Date;
  validUntil: Date;
}

export function inviteState(i: InviteTiming, now: Date): InviteState {
  if (i.status === "USED") return "USED";
  if (i.status === "CANCELLED") return "CANCELLED";
  if (now > i.validUntil) return "EXPIRED";
  if (now.getTime() < i.validFrom.getTime() - INVITE_EARLY_MINUTES * 60_000) return "NOT_YET";
  return "OPEN";
}

export const INVITE_STATE_TEXT: Record<InviteState, string> = {
  OPEN: "ใช้ได้",
  NOT_YET: "ยังไม่ถึงเวลา",
  EXPIRED: "หมดเวลาแล้ว",
  USED: "มาถึงแล้ว",
  CANCELLED: "ยกเลิกแล้ว",
};

/** ข้อความเมื่อ รปภ. สแกน QR ที่ใช้ไม่ได้ */
export function inviteProblem(state: InviteState, validFromText: string): string | null {
  switch (state) {
    case "OPEN":
      return null;
    case "NOT_YET":
      return `ยังไม่ถึงเวลาที่แจ้งไว้ (เริ่ม ${validFromText}) — เข้าได้ก่อนเวลาไม่เกิน ${INVITE_EARLY_MINUTES} นาที`;
    case "EXPIRED":
      return "QR นี้หมดเวลาแล้ว — ให้ลูกบ้านแจ้งใหม่ หรือลงทะเบียนตามปกติ";
    case "USED":
      return "QR นี้ใช้ Check-in ไปแล้ว";
    case "CANCELLED":
      return "ลูกบ้านยกเลิก QR นี้แล้ว";
  }
}

/** "2026-11-10T14:30" (เวลาไทย) → Date */
export function parseBangkokLocal(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${TZ_OFFSET}`);
  // กันวันที่ที่ไม่มีจริง เช่น 31 ก.พ. (Date จะเลื่อนไปเดือนถัดไป)
  return Number.isNaN(d.getTime()) || toBangkokLocal(d) !== `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` ? null : d;
}

/** Date → "2026-11-10T14:30" (เวลาไทย) สำหรับช่อง datetime-local */
export function toBangkokLocal(d: Date): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 16);
}

const dayFmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
const timeFmt = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export const inviteTimeText = (d: Date) => `${dayFmt.format(d)} ${timeFmt.format(d)} น.`;

/** "10 พ.ย. 14:00–18:00 น." หรือ "10 พ.ย. 14:00 น. – 12 พ.ย. 10:00 น." */
export function inviteWindowText(from: Date, until: Date): string {
  const sameDay = toBangkokLocal(from).slice(0, 10) === toBangkokLocal(until).slice(0, 10);
  return sameDay
    ? `${dayFmt.format(from)} ${timeFmt.format(from)}–${timeFmt.format(until)} น.`
    : `${inviteTimeText(from)} – ${inviteTimeText(until)}`;
}

/** ทะเบียนรถ: ตัดช่องว่างซ้ำ ตัวพิมพ์ใหญ่ */
export const normalizePlate = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();

export interface InviteInput {
  guestName: string | null;
  plateNumber: string | null;
  note: string | null;
  validFrom: Date;
  validUntil: Date;
}

export type InviteValidation = { ok: true; value: InviteInput } | { ok: false; errors: Record<string, string> };

const clean = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, max) : null;
};

/** ตรวจข้อมูลที่ลูกบ้านกรอก */
export function validateInviteInput(raw: Record<string, unknown>, now: Date): InviteValidation {
  const errors: Record<string, string> = {};
  const guestName = clean(raw.guestName, 120);
  const plate = clean(raw.plateNumber, 30);
  const note = clean(raw.note, 200);
  const from = parseBangkokLocal(String(raw.validFrom ?? ""));
  const until = parseBangkokLocal(String(raw.validUntil ?? ""));

  if (guestName && guestName.length < 2) errors.guestName = "ชื่อสั้นเกินไป";
  if (plate && !/[0-9]/.test(plate)) errors.plateNumber = "ทะเบียนรถไม่ถูกต้อง";
  if (!from) errors.validFrom = "กรุณาเลือกวันและเวลาที่แขกจะมา";
  if (!until) errors.validUntil = "กรุณาเลือกเวลาสิ้นสุด";
  if (from && until) {
    if (until <= from) errors.validUntil = "เวลาสิ้นสุดต้องหลังเวลาเริ่ม";
    else if (until <= now) errors.validUntil = "เวลาสิ้นสุดผ่านไปแล้ว";
    else if (until.getTime() - from.getTime() > INVITE_MAX_SPAN_DAYS * DAY) errors.validUntil = `ช่วงเวลาไม่เกิน ${INVITE_MAX_SPAN_DAYS} วัน`;
    if (from.getTime() - now.getTime() > INVITE_MAX_AHEAD_DAYS * DAY) errors.validFrom = `แจ้งล่วงหน้าได้ไม่เกิน ${INVITE_MAX_AHEAD_DAYS} วัน`;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { guestName, plateNumber: plate && normalizePlate(plate), note, validFrom: from!, validUntil: until! } };
}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

/** ค่าจาก QR (ลิงก์ .../g/<token> หรือ token ล้วน) → token — ไม่ขึ้นกับโดเมน เพราะ URL ของระบบอาจเปลี่ยน */
export function extractInviteToken(text: string): string | null {
  const s = text.trim();
  const m = /\/g\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/.exec(s);
  const token = m ? m[1] : s;
  return TOKEN_RE.test(token) ? token : null;
}

/** ข้อความที่ลูกบ้านส่งให้แขกทาง LINE */
export function inviteShareText(o: { placeText: string; windowText: string; plateNumber: string | null; url: string }): string {
  return [
    `เชิญมาที่ ${o.placeText}`,
    `ช่วงเวลา ${o.windowText}`,
    ...(o.plateNumber ? [`ทะเบียนรถ ${o.plateNumber}`] : []),
    "แสดง QR จากลิงก์นี้ที่ป้อม รปภ. ได้เลย",
    o.url,
  ].join("\n");
}
