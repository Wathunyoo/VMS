/** ช่วงวันที่ของรายงาน — วันตามเวลาไทย (UTC+7 ไม่มี DST) */
const TZ_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

export const MAX_RANGE_DAYS = 366;

/** "2026-10-05" ของวันที่ (เวลาไทย) */
export function bangkokDate(d: Date): string {
  return new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** เวลาเริ่มวัน (เวลาไทย) เป็น Date (UTC) */
export function startOfBangkokDay(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+07:00`);
}

export function addDays(ymd: string, n: number): string {
  return bangkokDate(new Date(startOfBangkokDay(ymd).getTime() + n * DAY_MS));
}

export const isYmd = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(startOfBangkokDay(s).getTime()) && bangkokDate(startOfBangkokDay(s)) === s;

/** รายการวันทั้งหมดในช่วง (รวมวันสุดท้าย) */
export function daysBetween(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  for (let d = fromYmd; d <= toYmd && out.length <= MAX_RANGE_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}
