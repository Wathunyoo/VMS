/** กฎเวลาเข้า-ออก — pure functions, ทดสอบได้โดยไม่ต้องมี DB */

const MS_PER_MIN = 60_000;

export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / MS_PER_MIN));
}

export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
}

/** maxStayMinutes = null → ไม่จำกัดเวลา (ไม่มีเวลาที่ต้องออก) */
export function computeExpectedCheckOut(checkInAt: Date, maxStayMinutes: number | null): Date | null {
  return maxStayMinutes == null ? null : new Date(checkInAt.getTime() + maxStayMinutes * MS_PER_MIN);
}

/** ไม่จำกัดเวลา → ไม่มีวันเกินเวลา */
export function computeOverstayMinutes(expectedCheckOutAt: Date | null, at: Date): number {
  return expectedCheckOutAt ? minutesBetween(expectedCheckOutAt, at) : 0;
}

export const UNLIMITED_STAY_LABEL = "ไม่จำกัดเวลา";

/** ข้อความเวลาอยู่ได้ เช่น "8 ชม." / "30 นาที" / "ไม่จำกัดเวลา" */
export function stayLimitText(minutes: number | null): string {
  if (minutes == null) return UNLIMITED_STAY_LABEL;
  return minutes % 60 === 0 ? `${minutes / 60} ชม.` : formatDuration(minutes);
}

/** ตัวเลือกเวลาอยู่ได้ในหน้า Check-in (นาที) — 0 = ไม่จำกัดเวลา */
export const STAY_OPTIONS_MINUTES = [60, 120, 240, 480, 720, 1440, 4320] as const;
export const MAX_STAY_MINUTES = 7 * 1440;
