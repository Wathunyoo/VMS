import type { CurrentStaff } from "./auth.types";

/**
 * ต้องไปหน้าไหนก่อน (null = ใช้หน้านี้ได้) — ลำดับ: ตั้งรหัสใหม่ → ตั้งค่าเริ่มต้น → ใช้งาน
 * หน้าตั้งรหัสใหม่ต้องเปิดได้แม้ยังไม่ได้ตั้งค่าเริ่มต้น (ลูกค้าใหม่มีทั้งสองอย่างค้างพร้อมกัน)
 */
export function staffGate(
  user: Pick<CurrentStaff, "mustChangePassword" | "needsOnboarding" | "role">,
  opts: { allowMustChangePassword?: boolean; allowOnboarding?: boolean } = {},
): "/account/password" | "/onboarding" | null {
  if (user.mustChangePassword) return opts.allowMustChangePassword ? null : "/account/password";
  // องค์กรใหม่: ผู้ดูแลต้องตั้งค่าเริ่มต้นก่อน (เจ้าหน้าที่ยังไม่ถูกสร้างจนกว่าจะเสร็จ)
  if (user.needsOnboarding && user.role === "ADMIN" && !opts.allowOnboarding) return "/onboarding";
  return null;
}
