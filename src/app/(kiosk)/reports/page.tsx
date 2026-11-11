import { parseReportQuery, reportHistory, reportOverview, visitStatusLabel } from "@/application/reports/report.usecase";
import { reportDeps } from "@/container";
import { formatDuration } from "@/domain/visit/stay";
import { PURPOSE_LABEL, PURPOSES_BY_MODE, SITE_TYPE_LABEL, visitingText } from "@/domain/visit/labels";
import { SITE_MODES } from "@/domain/visit/types";
import { ReportView, type HistoryView } from "@/features/reports/components/report-view";
import { requireOperator } from "@/infrastructure/auth/session";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await requireOperator();
  const q = parseReportQuery(await searchParams, new Date());
  const deps = reportDeps(staff.organizationId);
  const [sites, overview, history] = await Promise.all([deps.repo.sites(), reportOverview(staff, q, deps), reportHistory(staff, q, q.page, deps)]);
  const modes = SITE_MODES.filter((m) => sites.some((s) => s.mode === m));
  const purposes = [...new Set(modes.flatMap((m) => PURPOSES_BY_MODE[m]))].map((p) => ({ value: p, label: PURPOSE_LABEL[p] }));

  const rows: HistoryView[] = history.rows.map((r) => ({
    id: r.id,
    passCode: r.passCode,
    siteName: r.siteName,
    mode: r.mode,
    checkInText: fmt.format(r.checkInAt),
    checkOutText: r.checkOutAt ? fmt.format(r.checkOutAt) : null,
    durationText: r.timeSpentMinutes != null ? formatDuration(r.timeSpentMinutes) : null,
    overstay: (r.overstayMinutes ?? 0) > 0 || (r.status === "CHECKED_IN" && !!r.expectedCheckOutAt && r.expectedCheckOutAt < new Date()),
    status: r.status,
    statusLabel: visitStatusLabel(r.status),
    visitorName: r.visitorName,
    purged: r.purged,
    company: r.company,
    purposeLabel: PURPOSE_LABEL[r.purpose],
    visiting: r.unit ? visitingText(r.mode, r.unit) : (r.hostDepartment ?? "-"),
    hostName: r.hostName,
    plate: r.plate,
    // ภาพป้ายทะเบียน: เฉพาะผู้ดูแลระบบ
    platePhotoUrl: staff.role === "ADMIN" ? r.platePhotoUrl : null,
    custom: r.customValues.map((c) => `${c.label}: ${c.value}`).join(" · "),
  }));

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">รายงาน</h1>
        <p className="text-sm text-muted-foreground">สรุปจำนวนผู้มาติดต่อ และประวัติเข้า-ออก</p>
      </header>
      <ReportView
        filter={{ from: q.fromYmd, to: q.toYmd, site: q.siteId ?? "", purpose: q.purpose ?? "", status: q.status, q: q.q ?? "" }}
        sites={sites.map((s) => ({ id: s.id, label: `${s.name} (${SITE_TYPE_LABEL[s.mode]})` }))}
        purposes={purposes}
        overview={overview}
        history={{ rows, total: history.total, page: history.page, pages: history.pages }}
        canExport={staff.role === "ADMIN"}
      />
    </main>
  );
}
