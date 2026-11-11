import { toCsv } from "@/domain/reports/csv";
import type { ContractState } from "@/domain/org/contract";

/** แถวลูกค้าที่หน้า "ลูกค้า" ใช้แสดง/กรอง/ส่งออก (ไม่มีข้อมูลลับ) */
export interface CustomerView {
  id: string;
  slug: string;
  name: string;
  mode: "OFFICE" | "FACTORY" | "VILLAGE" | null;
  modeLabel: string;
  status: "PENDING" | "TRIAL" | "ACTIVE" | "SUSPENDED";
  accessLabel: string;
  canCheckIn: boolean;
  onboarded: boolean;
  contactEmail: string | null;
  pointLimit: number;
  activePoints: number;
  houseLimit: number | null;
  activeHouses: number;
  isVillage: boolean;
  /** "YYYY-MM-DD" หรือ "" */
  contractEndYmd: string;
  contractEndText: string | null;
  contractState: ContractState;
  contractDaysLeft: number | null;
  contractLabel: string;
  billing: { legalName: string; taxId: string; branch: string; address: string; billingEmail: string } | null;
  admins: string[];
  sites: number;
  createdText: string;
  lastVisitText: string | null;
  isPlatform: boolean;
}

export interface CustomerFilter {
  q: string;
  mode: "" | "VILLAGE" | "OFFICE" | "FACTORY";
  status: "" | "TRIAL" | "ACTIVE" | "SUSPENDED";
  /** DUE = ต้องต่อสัญญา (ใกล้หมด + หมดแล้ว) */
  contract: "" | "DUE" | "SOON" | "EXPIRED" | "NONE" | "NOTAX";
}

export const EMPTY_FILTER: CustomerFilter = { q: "", mode: "", status: "", contract: "" };

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | "" => (allowed.includes(v as T) ? (v as T) : "");

export function parseCustomerFilter(p: Record<string, string | undefined>): CustomerFilter {
  return {
    q: String(p.q ?? "").slice(0, 100),
    mode: pick(p.mode, ["VILLAGE", "OFFICE", "FACTORY"] as const),
    status: pick(p.status, ["TRIAL", "ACTIVE", "SUSPENDED"] as const),
    contract: pick(p.contract, ["DUE", "SOON", "EXPIRED", "NONE", "NOTAX"] as const),
  };
}

export function filterQuery(f: CustomerFilter): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p.toString();
}

/** ค้นหา: ชื่อ รหัสองค์กร อีเมล ชื่อผู้ซื้อ เลขผู้เสียภาษี ผู้ดูแล */
export function matchCustomer(c: CustomerView, f: CustomerFilter): boolean {
  if (f.mode && c.mode !== f.mode) return false;
  if (f.status && c.status !== f.status) return false;
  switch (f.contract) {
    case "DUE":
      if (c.contractState !== "SOON" && c.contractState !== "EXPIRED") return false;
      break;
    case "SOON":
    case "EXPIRED":
    case "NONE":
      if (c.contractState !== f.contract) return false;
      break;
    case "NOTAX":
      if (c.billing) return false;
      break;
  }
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  const hay = [c.name, c.slug, c.contactEmail, c.billing?.legalName, c.billing?.billingEmail, ...c.admins].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q) || (digits.length >= 4 && !!c.billing?.taxId.includes(digits));
}

const STATUS_LABEL = { PENDING: "รอยืนยัน", TRIAL: "ทดลองใช้", ACTIVE: "ใช้งาน", SUSPENDED: "ถูกระงับ" } as const;

/** CSV (เปิดใน Excel) — ไม่มีรหัสผ่านหรือข้อมูลผู้มาติดต่อ */
export function customersCsv(rows: CustomerView[]): string {
  return toCsv([
    [
      "ชื่อลูกค้า",
      "รหัสองค์กร",
      "ประเภท",
      "สถานะ",
      "สิทธิ์ใช้งาน",
      "วันสิ้นสุดสัญญา",
      "สถานะสัญญา",
      "จุดลงทะเบียน (สัญญา)",
      "จุดที่ใช้",
      "บ้าน (สัญญา)",
      "บ้านที่ใช้",
      "ชื่อผู้ซื้อ (ใบกำกับภาษี)",
      "เลขประจำตัวผู้เสียภาษี",
      "สำนักงานใหญ่/สาขา",
      "ที่อยู่",
      "อีเมลติดต่อ",
      "ผู้ดูแลของลูกค้า",
      "จำนวนสถานที่",
      "ตั้งค่าเริ่มต้นแล้ว",
      "วันที่สร้าง",
      "ใช้งานล่าสุด",
    ],
    ...rows.map((c) => [
      c.name,
      c.slug,
      c.modeLabel,
      STATUS_LABEL[c.status],
      c.accessLabel,
      c.contractEndYmd || null,
      c.contractLabel,
      c.pointLimit,
      c.activePoints,
      c.isVillage ? (c.houseLimit ?? "ไม่จำกัด") : null,
      c.isVillage ? c.activeHouses : null,
      c.billing?.legalName,
      // ใส่ขีดตามรูปแบบ 1-4-5-2-1 เพื่อไม่ให้ Excel ตัดเลข 0 นำหน้า
      c.billing ? c.billing.taxId.replace(/^(\d)(\d{4})(\d{5})(\d{2})(\d)$/, "$1-$2-$3-$4-$5") : null,
      c.billing?.branch,
      c.billing?.address,
      c.contactEmail,
      c.admins.join(", "),
      c.sites,
      c.onboarded ? "ใช่" : "ยังไม่เสร็จ",
      c.createdText,
      c.lastVisitText,
    ]),
  ]);
}
