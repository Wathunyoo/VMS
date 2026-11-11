import type { CustomValue } from "@/domain/form/form-config";
import type { SiteMode, StampStatus, VisitPurpose } from "@/domain/visit/types";

export type VisitStatusFilter = "ALL" | "INSIDE" | "OUT";

export interface ReportFilter {
  fromYmd: string;
  toYmd: string;
  /** เวลาเริ่ม (รวม) และสิ้นสุด (ไม่รวม) ของช่วง */
  from: Date;
  to: Date;
  siteId: string | null;
  purpose: VisitPurpose | null;
}

export interface HistoryQuery extends ReportFilter {
  q: string | null;
  status: VisitStatusFilter;
}

export interface ReportSummary {
  total: number;
  uniqueVisitors: number;
  withVehicle: number;
  avgMinutes: number | null;
  overstay: number;
  stillInside: number;
}

export interface HistoryRow {
  id: string;
  passCode: string;
  siteName: string;
  mode: SiteMode;
  checkInAt: Date;
  checkOutAt: Date | null;
  expectedCheckOutAt: Date | null;
  timeSpentMinutes: number | null;
  overstayMinutes: number | null;
  status: "PENDING_APPROVAL" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED";
  visitorName: string;
  purged: boolean;
  company: string | null;
  phone: string | null;
  idType: string;
  idNumberMasked: string;
  purpose: VisitPurpose;
  purposeNote: string | null;
  unit: { name: string; floor: string; unit: string | null } | null;
  hostName: string | null;
  hostDepartment: string | null;
  stampStatus: StampStatus;
  plate: string | null;
  /** ภาพป้ายทะเบียน (null = ไม่ได้ถ่าย หรือถูกลบตามระยะเวลาเก็บข้อมูล) */
  platePhotoUrl: string | null;
  vehicleType: string | null;
  badgeNumber: string | null;
  customValues: CustomValue[];
  checkedInBy: string | null;
  checkedOutBy: string | null;
}

/** รายงานขององค์กรหนึ่ง (ผูก orgId แล้ว) */
export interface ReportRepository {
  sites(): Promise<{ id: string; name: string; mode: SiteMode }[]>;
  summary(f: ReportFilter): Promise<Omit<ReportSummary, "stillInside">>;
  insideNow(siteId: string | null): Promise<number>;
  daily(f: ReportFilter): Promise<{ day: string; count: number }[]>;
  hourly(f: ReportFilter): Promise<{ hour: number; count: number }[]>;
  byPurpose(f: ReportFilter): Promise<{ purpose: VisitPurpose; count: number }[]>;
  topUnits(f: ReportFilter, limit: number): Promise<{ name: string; floor: string; mode: SiteMode; count: number }[]>;
  history(q: HistoryQuery, skip: number, take: number): Promise<{ rows: HistoryRow[]; total: number }>;
}
