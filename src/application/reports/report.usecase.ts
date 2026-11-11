import { toCsv } from "@/domain/reports/csv";
import { MAX_RANGE_DAYS, addDays, bangkokDate, daysBetween, isYmd, startOfBangkokDay } from "@/domain/reports/range";
import { ID_TYPE_LABEL, PURPOSE_LABEL, SITE_TYPE_LABEL, stampStatusLabel, VEHICLE_TYPE_LABEL, visitingText } from "@/domain/visit/labels";
import { VISIT_PURPOSES, type IdDocumentType, type VehicleType, type VisitPurpose } from "@/domain/visit/types";
import type { CurrentStaff } from "../auth/auth.types";
import type { HistoryQuery, HistoryRow, ReportFilter, ReportRepository, VisitStatusFilter } from "./report.types";

export class ReportError extends Error {}

export interface ReportDeps {
  repo: ReportRepository;
  now?: () => Date;
}

export const PAGE_SIZE = 50;
export const EXPORT_LIMIT = 20_000;

export interface RawReportParams {
  from?: string;
  to?: string;
  site?: string;
  purpose?: string;
  status?: string;
  q?: string;
  page?: string;
}

/** อ่านตัวกรองจาก URL — ค่าผิดรูปแบบใช้ค่าเริ่มต้น (7 วันล่าสุด) */
export function parseReportQuery(p: RawReportParams, now: Date): HistoryQuery & { page: number } {
  const today = bangkokDate(now);
  let toYmd = isYmd(p.to) ? p.to : today;
  let fromYmd = isYmd(p.from) ? p.from : addDays(toYmd, -6);
  if (fromYmd > toYmd) [fromYmd, toYmd] = [toYmd, fromYmd];
  if (daysBetween(fromYmd, toYmd).length > MAX_RANGE_DAYS) fromYmd = addDays(toYmd, -(MAX_RANGE_DAYS - 1));
  const status: VisitStatusFilter = p.status === "INSIDE" || p.status === "OUT" ? p.status : "ALL";
  const q = (p.q ?? "").trim().slice(0, 60) || null;
  const page = Math.max(1, Math.min(10_000, Math.trunc(Number(p.page) || 1)));
  return {
    fromYmd,
    toYmd,
    from: startOfBangkokDay(fromYmd),
    to: startOfBangkokDay(addDays(toYmd, 1)),
    siteId: p.site && /^[a-z0-9]{10,40}$/i.test(p.site) ? p.site : null,
    purpose: (VISIT_PURPOSES as readonly string[]).includes(p.purpose ?? "") ? (p.purpose as VisitPurpose) : null,
    status,
    q,
    page,
  };
}

/** สรุป + กราฟ */
export async function reportOverview(_actor: CurrentStaff, f: ReportFilter, deps: ReportDeps) {
  const [summary, stillInside, daily, hourly, byPurpose, topUnits] = await Promise.all([
    deps.repo.summary(f),
    deps.repo.insideNow(f.siteId),
    deps.repo.daily(f),
    deps.repo.hourly(f),
    deps.repo.byPurpose(f),
    deps.repo.topUnits(f, 10),
  ]);
  const byDay = new Map(daily.map((d) => [d.day, d.count]));
  const byHour = new Map(hourly.map((h) => [h.hour, h.count]));
  return {
    summary: { ...summary, stillInside },
    daily: daysBetween(f.fromYmd, f.toYmd).map((day) => ({ day, count: byDay.get(day) ?? 0 })),
    hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, count: byHour.get(hour) ?? 0 })),
    byPurpose: byPurpose.sort((a, b) => b.count - a.count).map((p) => ({ ...p, label: PURPOSE_LABEL[p.purpose] })),
    topUnits: topUnits.map((u) => ({ label: visitingText(u.mode, u), count: u.count })),
  };
}

export async function reportHistory(_actor: CurrentStaff, q: HistoryQuery, page: number, deps: ReportDeps) {
  const r = await deps.repo.history(q, (page - 1) * PAGE_SIZE, PAGE_SIZE);
  return { ...r, page, pages: Math.max(1, Math.ceil(r.total / PAGE_SIZE)) };
}

const fmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });
const STATUS_LABEL: Record<HistoryRow["status"], string> = {
  PENDING_APPROVAL: "รออนุมัติ",
  CHECKED_IN: "อยู่ในพื้นที่",
  CHECKED_OUT: "ออกแล้ว",
  CANCELLED: "ยกเลิก",
};
export const visitStatusLabel = (s: HistoryRow["status"]) => STATUS_LABEL[s];

/** CSV สำหรับ Excel — เฉพาะผู้ดูแลระบบ (มีข้อมูลส่วนบุคคล) */
export async function exportHistoryCsv(actor: CurrentStaff, q: HistoryQuery, deps: ReportDeps) {
  if (actor.role !== "ADMIN") throw new ReportError("เฉพาะผู้ดูแลระบบ");
  const { rows, total } = await deps.repo.history(q, 0, EXPORT_LIMIT);
  if (total > EXPORT_LIMIT) throw new ReportError(`ข้อมูลมาก (${total.toLocaleString()} รายการ) — เลือกช่วงวันที่ให้สั้นลง (ไม่เกิน ${EXPORT_LIMIT.toLocaleString()} รายการ)`);

  // คอลัมน์ช่องเพิ่มเติม: รวมชื่อช่องที่พบในช่วงนี้
  const customLabels: string[] = [];
  for (const r of rows) for (const c of r.customValues) if (!customLabels.includes(c.label)) customLabels.push(c.label);

  const header = [
    "รหัสบัตร",
    "สถานที่",
    "ประเภท",
    "เวลาเข้า",
    "เวลาออก",
    "อยู่ (นาที)",
    "เกินเวลา (นาที)",
    "สถานะ",
    "ชื่อ-นามสกุล",
    "บริษัท/หน่วยงาน",
    "เบอร์โทร",
    "ประเภทเอกสาร",
    "เลขเอกสาร (ปิดบางส่วน)",
    "วัตถุประสงค์",
    "รายละเอียด",
    "ติดต่อ (บริษัท/บ้าน)",
    "ผู้รับพบ/ลูกบ้าน",
    "E-Stamp",
    "ทะเบียนรถ",
    "ประเภทรถ",
    "เลขบัตรแลก",
    ...customLabels,
    "ผู้บันทึกเข้า",
    "ผู้บันทึกออก",
  ];
  const body = rows.map((r) => {
    const custom = new Map(r.customValues.map((c) => [c.label, c.value]));
    return [
      r.passCode,
      r.siteName,
      SITE_TYPE_LABEL[r.mode],
      fmt.format(r.checkInAt),
      r.checkOutAt ? fmt.format(r.checkOutAt) : "",
      r.timeSpentMinutes,
      r.overstayMinutes || "",
      STATUS_LABEL[r.status],
      r.visitorName,
      r.company,
      r.phone,
      ID_TYPE_LABEL[r.idType as IdDocumentType] ?? r.idType,
      r.idNumberMasked,
      PURPOSE_LABEL[r.purpose],
      r.purposeNote,
      r.unit ? visitingText(r.mode, r.unit) : r.hostDepartment,
      r.hostName,
      r.stampStatus === "NOT_REQUIRED" ? "" : stampStatusLabel(r.mode, r.stampStatus),
      r.plate,
      r.vehicleType ? (VEHICLE_TYPE_LABEL[r.vehicleType as VehicleType] ?? r.vehicleType) : "",
      r.badgeNumber,
      ...customLabels.map((l) => custom.get(l) ?? ""),
      r.checkedInBy,
      r.checkedOutBy,
    ];
  });
  return { csv: toCsv([header, ...body]), count: rows.length, filename: `visits_${q.fromYmd}_${q.toYmd}.csv` };
}
