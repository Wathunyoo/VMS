import { customersCsv, matchCustomer, parseCustomerFilter } from "@/features/customers/customer-view";
import { loadCustomerViews } from "@/features/customers/load-customers";
import { requirePlatformAdmin } from "@/infrastructure/auth/station";

export const dynamic = "force-dynamic";

/** ดาวน์โหลดรายชื่อลูกค้าเป็น CSV (เปิดใน Excel) ตามตัวกรองที่เลือก — เฉพาะผู้ให้บริการ */
export async function GET(req: Request) {
  const admin = await requirePlatformAdmin();
  const now = new Date();
  const f = parseCustomerFilter(Object.fromEntries(new URL(req.url).searchParams));
  const rows = (await loadCustomerViews(now)).filter((c) => matchCustomer(c, f));
  const ymd = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  console.info(`[customers] export ${rows.length} rows by ${admin.username}`);
  return new Response(customersCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vms-customers-${ymd}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
