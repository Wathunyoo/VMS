/**
 * จำนวนบ้านตามสัญญา (โหมดหมู่บ้าน) — ใช้คิดราคาตามจำนวนบ้าน
 * นับเฉพาะบ้านที่เปิดใช้งานในสถานที่แบบหมู่บ้าน · บ้านที่ปิดใช้งานไม่นับ
 */
export interface HouseQuota {
  /** null = ไม่จำกัด */
  limit: number | null;
  used: number;
}

export const MAX_CONTRACT_HOUSES = 100_000;

/** เพิ่ม/เปิดใช้บ้านอีก adding หลังได้ไหม — คืนข้อความเหตุผลถ้าไม่ได้ */
export function houseQuotaProblem(q: HouseQuota, adding: number): string | null {
  if (q.limit == null || adding <= 0) return null;
  if (q.used + adding <= q.limit) return null;
  const left = Math.max(0, q.limit - q.used);
  return left === 0
    ? `ครบจำนวนบ้านตามสัญญาแล้ว (${q.limit} หลัง) — ปิดใช้งานบ้านที่ไม่ใช้ หรือติดต่อผู้ให้บริการเพื่อเพิ่มจำนวนบ้าน`
    : `เพิ่มได้อีก ${left} หลัง (สัญญา ${q.limit} หลัง ใช้แล้ว ${q.used}) — แต่รายการนี้มี ${adding} หลัง`;
}
