import { loadInvoiceFor } from "@/features/billing/load-invoice";
import { getCurrentUser } from "@/infrastructure/auth/session";
import { readSlip } from "@/infrastructure/billing/slip-storage";

/** สลิปโอนเงิน — เปิดได้เฉพาะผู้ดูแลขององค์กรนั้น หรือผู้ให้บริการ */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const inv = user && !user.mustChangePassword ? await loadInvoiceFor(user, (await ctx.params).id) : null;
  const file = inv?.slipPath ? await readSlip(inv.slipPath) : null;
  if (!file) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(file.data), {
    headers: { "Content-Type": file.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
