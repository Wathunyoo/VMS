/**
 * URL สาธารณะของระบบ (ใช้สร้างลิงก์ E-Stamp / Webhook)
 * อ่านตอนรัน (ไม่ฝังตอน build) เพราะ Quick Tunnel ได้ URL ใหม่ทุกครั้งที่เปิด
 */
export function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}
