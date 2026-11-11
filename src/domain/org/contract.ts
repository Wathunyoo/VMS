/**
 * วันสิ้นสุดสัญญา — ใช้แจ้งเตือนผู้ให้บริการให้ติดต่อลูกค้าเพื่อต่อสัญญา
 * (ไม่หยุดการใช้งานอัตโนมัติ — การระงับทำด้วยมือที่หน้า "ลูกค้า")
 */
export type ContractState = "NONE" | "OK" | "SOON" | "EXPIRED";

/** แจ้งเตือนล่วงหน้ากี่วัน */
export const CONTRACT_NOTICE_DAYS = 60;

const DAY = 86_400_000;
const BKK = 7 * 3_600_000;

/** วันที่ (ตามเวลาไทย) → Date เวลา 00:00 น. ไทย */
export function contractDateFromYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d) - BKK;
  const back = new Date(t + BKK);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return new Date(t);
}

/** Date → "YYYY-MM-DD" ตามเวลาไทย */
export function contractYmd(d: Date): string {
  return new Date(d.getTime() + BKK).toISOString().slice(0, 10);
}

/** วันคงเหลือตามปฏิทินไทย: 0 = วันนี้เป็นวันสุดท้าย, ติดลบ = หมดแล้ว */
export function contractDaysLeft(endsAt: Date, now: Date): number {
  const today = contractDateFromYmd(contractYmd(now))!;
  return Math.round((endsAt.getTime() - today.getTime()) / DAY);
}

export function contractStatus(endsAt: Date | null, now: Date): { state: ContractState; daysLeft: number | null } {
  if (!endsAt) return { state: "NONE", daysLeft: null };
  const daysLeft = contractDaysLeft(endsAt, now);
  if (daysLeft < 0) return { state: "EXPIRED", daysLeft };
  return { state: daysLeft <= CONTRACT_NOTICE_DAYS ? "SOON" : "OK", daysLeft };
}

export function contractStatusText(s: { state: ContractState; daysLeft: number | null }): string {
  switch (s.state) {
    case "NONE":
      return "ยังไม่ระบุ";
    case "EXPIRED":
      return `หมดสัญญาแล้ว ${-s.daysLeft!} วัน`;
    default:
      return s.daysLeft === 0 ? "สิ้นสุดวันนี้" : `เหลือ ${s.daysLeft} วัน`;
  }
}
