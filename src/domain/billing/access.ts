import { PRICING } from "./pricing";

export type AccessState = "TRIAL" | "TRIAL_ENDED" | "ACTIVE" | "GRACE" | "EXPIRED" | "UNLIMITED" | "SUSPENDED" | "PENDING";

export interface Access {
  state: AccessState;
  /** Check-in ผู้ติดต่อใหม่ได้ไหม (Check-out ทำได้เสมอ) */
  canCheckIn: boolean;
  /** วันที่เหลือก่อนสิ้นสุดสิทธิ์ปัจจุบัน (null = ไม่จำกัด) */
  daysLeft: number | null;
  until: Date | null;
  pointLimit: number;
  message: string | null;
}

const DAY = 86_400_000;
const daysBetween = (from: Date, to: Date) => Math.ceil((to.getTime() - from.getTime()) / DAY);

/** สิทธิ์การใช้งานขององค์กร ณ เวลา now */
export function computeAccess(
  org: { status: string; trialEndsAt: Date | null; paidUntil: Date | null; checkInPointLimit: number },
  now: Date,
): Access {
  const limit = org.checkInPointLimit;
  if (org.status === "SUSPENDED") return { state: "SUSPENDED", canCheckIn: false, daysLeft: 0, until: null, pointLimit: limit, message: "บัญชีถูกระงับ" };
  if (org.status === "PENDING") return { state: "PENDING", canCheckIn: false, daysLeft: 0, until: null, pointLimit: limit, message: "รอยืนยันอีเมล" };

  // เคยชำระแล้ว → ใช้รอบที่ชำระเป็นหลัก
  if (org.paidUntil) {
    const left = daysBetween(now, org.paidUntil);
    if (left > 0) return { state: "ACTIVE", canCheckIn: true, daysLeft: left, until: org.paidUntil, pointLimit: limit, message: left <= 7 ? `รอบบริการจะหมดใน ${left} วัน` : null };
    const graceEnd = new Date(org.paidUntil.getTime() + PRICING.graceDays * DAY);
    const graceLeft = daysBetween(now, graceEnd);
    if (graceLeft > 0) {
      return { state: "GRACE", canCheckIn: true, daysLeft: graceLeft, until: graceEnd, pointLimit: limit, message: `รอบบริการหมดแล้ว — ระบบจะหยุดรับ Check-in ใน ${graceLeft} วัน` };
    }
    return { state: "EXPIRED", canCheckIn: false, daysLeft: 0, until: org.paidUntil, pointLimit: limit, message: "รอบบริการหมดแล้ว — ติดต่อผู้ให้บริการเพื่อ Check-in ต่อ (Check-out ยังทำได้)" };
  }

  if (org.status === "TRIAL") {
    if (org.trialEndsAt && org.trialEndsAt > now) {
      return { state: "TRIAL", canCheckIn: true, daysLeft: daysBetween(now, org.trialEndsAt), until: org.trialEndsAt, pointLimit: limit, message: null };
    }
    return { state: "TRIAL_ENDED", canCheckIn: false, daysLeft: 0, until: org.trialEndsAt, pointLimit: limit, message: "หมดช่วงทดลองใช้ — ติดต่อผู้ให้บริการเพื่อทำสัญญา (Check-out ยังทำได้)" };
  }

  // ACTIVE ไม่มีวันหมดอายุ = สัญญาพิเศษ (เช่น องค์กรของผู้ให้บริการเอง)
  return { state: "UNLIMITED", canCheckIn: true, daysLeft: null, until: null, pointLimit: limit, message: null };
}

/** รอบใหม่เริ่มต่อจากรอบเดิม (ถ้ายังไม่หมด) หรือเริ่มวันนี้ */
export function extendCoverage(currentPaidUntil: Date | null, now: Date, months: number): { from: Date; until: Date } {
  const from = currentPaidUntil && currentPaidUntil > now ? currentPaidUntil : now;
  const until = new Date(from);
  until.setMonth(until.getMonth() + months);
  return { from, until };
}
