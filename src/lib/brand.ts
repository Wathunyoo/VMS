/**
 * ชื่อระบบที่ผู้ใช้เห็น — "มานะ" มาจาก "มีคนมาหานะ" (และชื่อมานะในแบบเรียนภาษาไทย)
 * ชื่อทางเทคนิค (VMS1 ในบัตรผ่าน, VMSBK1 ในไฟล์สำรอง, โฟลเดอร์ VMS-Backups) คงเดิมเพื่อให้ของเดิมใช้ได้
 */
export const APP_NAME = "มานะ";
export const APP_TAGLINE = "ระบบแลกบัตรผู้ติดต่อ";

/** ไฟล์โลโก้ (public/brand) */
export const BRAND = {
  /** โลโก้เต็ม (ภาพประกอบ + ชื่อ) — หน้า login เอกสาร */
  logo: "/brand/mana-logo.webp",
  /** ตัวอักษร "มานะ" พื้นโปร่งใส — แถบเมนู หัวเอกสาร */
  wordmark: "/brand/mana-wordmark.png",
  /** ตัวอักษรขาว-ดำ — บัตรผ่าน Thermal */
  wordmarkBw: "/brand/mana-wordmark-bw.png",
  /** ไอคอนกระดิ่ง */
  icon: "/brand/mana-icon.png",
} as const;
