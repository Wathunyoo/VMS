/**
 * CSV สำหรับเปิดใน Excel
 *  - ขึ้นต้นด้วย BOM ให้ Excel อ่านภาษาไทยถูก
 *  - กันสูตร Excel (CSV injection): ค่าที่ขึ้นต้นด้วย = + - @ tab CR ใส่ ' นำหน้า
 */
const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
