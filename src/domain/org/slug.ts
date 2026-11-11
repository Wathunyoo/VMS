/** รหัสองค์กร (ใช้ตอน login และในอนาคตเป็น subdomain) */
const RESERVED = new Set(["admin", "api", "app", "www", "login", "stamp", "photos", "static", "support", "help", "billing", "status"]);

export function validateOrgSlug(slug: string): string | null {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(slug)) {
    return "รหัสองค์กรต้องเป็น a-z, 0-9 หรือ - ยาว 3–32 ตัว และไม่ขึ้นต้น/ลงท้ายด้วย -";
  }
  if (RESERVED.has(slug)) return `"${slug}" เป็นคำสงวน`;
  return null;
}
