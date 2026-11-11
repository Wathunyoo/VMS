import "server-only";
import type { CurrentStaff } from "@/application/auth/auth.types";
import { billingDeps, platformDeps } from "@/container";
import { isPlatformAdmin } from "@/infrastructure/auth/station";

/** ใบแจ้งหนี้ที่ผู้ใช้มีสิทธิ์ดู: ผู้ดูแลขององค์กรนั้น หรือผู้ให้บริการ */
export async function loadInvoiceFor(user: CurrentStaff, id: string) {
  if (user.role !== "ADMIN") return null;
  const own = await billingDeps(user.organizationId).repo.invoice(id);
  if (own) return own;
  if (isPlatformAdmin(user)) return platformDeps().repo.invoice(id);
  return null;
}
