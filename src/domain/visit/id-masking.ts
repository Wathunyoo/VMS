import type { IdDocumentType } from "./types";

/** ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/ตัวเลข และทำเป็นตัวพิมพ์ใหญ่ */
export function normalizeIdNumber(raw: string): string {
  return raw.replace(/[^0-9a-z]/gi, "").toUpperCase();
}

/** ตรวจ checksum เลขบัตรประชาชนไทย 13 หลัก */
export function isValidThaiNationalId(raw: string): boolean {
  const id = normalizeIdNumber(raw);
  if (!/^\d{13}$/.test(id)) return false;
  const sum = [...id.slice(0, 12)].reduce((acc, d, i) => acc + Number(d) * (13 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

/**
 * PDPA masking — แสดงเฉพาะ N ตัวท้าย (ค่าเริ่มต้น 4)
 *  - บัตรประชาชน: 1103700012345 → X-XXXX-XXXX2-34-5  (คงรูปแบบ 1-4-5-2-1)
 *  - อื่น ๆ:       AB1234567      → XXXXX4567
 */
export function maskIdNumber(raw: string, type: IdDocumentType, visibleDigits = 4): string {
  const id = normalizeIdNumber(raw);
  if (!id) return "";
  const keepFrom = Math.max(0, id.length - visibleDigits);
  const masked = [...id].map((c, i) => (i < keepFrom ? "X" : c)).join("");

  if (type === "NATIONAL_ID" && id.length === 13) {
    return [masked.slice(0, 1), masked.slice(1, 5), masked.slice(5, 10), masked.slice(10, 12), masked.slice(12)].join("-");
  }
  return masked;
}
