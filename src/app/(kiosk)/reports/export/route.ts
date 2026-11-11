import { exportHistoryCsv, parseReportQuery, ReportError } from "@/application/reports/report.usecase";
import { reportDeps } from "@/container";
import { requireOperator } from "@/infrastructure/auth/session";

export const dynamic = "force-dynamic";

/** ดาวน์โหลดประวัติเข้า-ออกเป็น CSV (เปิดใน Excel) — เฉพาะผู้ดูแลระบบ */
export async function GET(req: Request) {
  const staff = await requireOperator();
  if (staff.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const q = parseReportQuery(params, new Date());
  try {
    const { csv, filename, count } = await exportHistoryCsv(staff, q, reportDeps(staff.organizationId));
    console.info(`[report] export ${count} rows by ${staff.orgSlug}/${staff.username} (${q.fromYmd}..${q.toYmd})`);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ReportError) return new Response(e.message, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    throw e;
  }
}
