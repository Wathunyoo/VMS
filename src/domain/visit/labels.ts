import type {
  HighRiskWork,
  IdDocumentType,
  PpeItem,
  SiteMode,
  StampStatus,
  VehicleType,
  VisitPurpose,
} from "./types";

export const SITE_MODE_LABEL: Record<SiteMode, string> = {
  OFFICE: "โหมดออฟฟิศ",
  FACTORY: "โหมดโรงงาน",
  VILLAGE: "โหมดหมู่บ้าน",
};

/** ประเภทสถานที่ (ใช้ในหน้าตั้งค่า / รายงาน) */
export const SITE_TYPE_LABEL: Record<SiteMode, string> = {
  OFFICE: "อาคารสำนักงาน",
  FACTORY: "โรงงาน",
  VILLAGE: "หมู่บ้าน / คอนโด",
};

/**
 * คำเรียกรายชื่อหลักตามประเภทสถานที่ — ใช้ตาราง Tenant/Host เดียวกัน
 *  อาคารสำนักงาน: Tenant = บริษัทผู้เช่า (floor = ชั้น), Host = พนักงาน
 *  หมู่บ้าน:       Tenant = บ้าน (name = บ้านเลขที่, floor = ซอย/โซน), Host = ลูกบ้าน
 *  โรงงาน:         Tenant = ไม่ใช้ (หรือใช้เป็นอาคาร/แผนก), Host = พนักงาน
 */
export interface DirectoryTerms {
  unit: string;
  unitName: string;
  group: string;
  person: string;
  personHint: string;
  allGroups: string;
  search: string;
}

export const DIRECTORY_TERMS: Record<SiteMode, DirectoryTerms> = {
  OFFICE: {
    unit: "บริษัทผู้เช่า",
    unitName: "ชื่อบริษัท",
    group: "ชั้น",
    person: "ผู้ที่ต้องการพบ (Host)",
    personHint: "พนักงานของบริษัทผู้เช่า",
    allGroups: "ทุกชั้น",
    search: "ชื่อบริษัท / ชื่อพนักงาน / แผนก",
  },
  VILLAGE: {
    unit: "บ้าน",
    unitName: "บ้านเลขที่",
    group: "ซอย / โซน",
    person: "ลูกบ้าน",
    personHint: "ผู้อยู่อาศัยที่รับแจ้งเตือนเมื่อมีผู้มาหา",
    allGroups: "ทุกซอย",
    search: "บ้านเลขที่ / ชื่อลูกบ้าน",
  },
  FACTORY: {
    unit: "อาคาร / หน่วยงาน",
    unitName: "ชื่ออาคาร / หน่วยงาน",
    group: "โซน",
    person: "ผู้ที่ต้องการพบ (Host)",
    personHint: "พนักงานในโรงงาน",
    allGroups: "ทุกโซน",
    search: "ชื่อพนักงาน / แผนก",
  },
};

/** ข้อความ "ติดต่อ" บนบัตร/หน้า Check-out เช่น "บจก. ABC · ชั้น 12" หรือ "บ้าน 99/12 · ซอย 3" */
export function visitingText(
  mode: SiteMode,
  tenant: { name: string; floor: string; unit?: string | null } | null,
  fallback?: string | null,
): string {
  if (!tenant) return fallback || "-";
  const group = tenant.floor && tenant.floor !== "-" ? tenant.floor : null;
  if (mode === "VILLAGE") return `บ้าน ${tenant.name}${group ? ` · ซอย ${group}` : ""}`;
  if (mode === "FACTORY") return `${tenant.name}${group ? ` · โซน ${group}` : ""}`;
  return `${tenant.name}${group ? ` · ชั้น ${group}` : ""}${tenant.unit ? ` (${tenant.unit})` : ""}`;
}

export const ID_TYPE_LABEL: Record<IdDocumentType, string> = {
  NATIONAL_ID: "บัตรประชาชน",
  DRIVER_LICENSE: "ใบขับขี่",
  PASSPORT: "หนังสือเดินทาง",
  OTHER: "อื่น ๆ",
};

export const PURPOSE_LABEL: Record<VisitPurpose, string> = {
  INTERVIEW: "สัมภาษณ์งาน",
  MEETING: "ประชุม / พบลูกค้า",
  DELIVERY: "ส่งเอกสาร / พัสดุ",
  MAINTENANCE: "งานซ่อมบำรุง",
  CONTRACTOR_WORK: "ผู้รับเหมา / เข้าทำงาน",
  CARGO: "ขนส่ง / รับ-ส่งสินค้า",
  GUEST: "เยี่ยมญาติ / เพื่อน",
  FOOD_DELIVERY: "ส่งอาหาร",
  OTHER: "อื่น ๆ",
};

export const OFFICE_PURPOSES: VisitPurpose[] = ["INTERVIEW", "MEETING", "DELIVERY", "MAINTENANCE", "OTHER"];
export const FACTORY_PURPOSES: VisitPurpose[] = ["MEETING", "CONTRACTOR_WORK", "MAINTENANCE", "CARGO", "DELIVERY", "OTHER"];
export const VILLAGE_PURPOSES: VisitPurpose[] = ["GUEST", "DELIVERY", "FOOD_DELIVERY", "MAINTENANCE", "CONTRACTOR_WORK", "OTHER"];

export const PURPOSES_BY_MODE: Record<SiteMode, VisitPurpose[]> = {
  OFFICE: OFFICE_PURPOSES,
  FACTORY: FACTORY_PURPOSES,
  VILLAGE: VILLAGE_PURPOSES,
};

export const HIGH_RISK_LABEL: Record<HighRiskWork, string> = {
  HOT_WORK: "งานที่ก่อให้เกิดความร้อน/ประกายไฟ (Hot Work)",
  CONFINED_SPACE: "งานในที่อับอากาศ (Confined Space)",
  WORKING_AT_HEIGHTS: "งานบนที่สูง (Working at Heights)",
  ELECTRICAL: "งานไฟฟ้า",
  CHEMICAL: "งานสารเคมีอันตราย",
  LIFTING: "งานยก/เครน",
};

export const PPE_LABEL: Record<PpeItem, string> = {
  ppeHelmet: "หมวกเซฟตี้",
  ppeSafetyShoes: "รองเท้าหัวเหล็ก",
  ppeReflectiveVest: "เสื้อสะท้อนแสง",
  ppeSafetyGlasses: "แว่นตานิรภัย",
  ppeEarProtection: "ที่อุดหู/ครอบหู",
  ppeGloves: "ถุงมือ",
};

export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  CAR: "รถยนต์",
  MOTORCYCLE: "รถจักรยานยนต์",
  PICKUP: "รถกระบะ",
  VAN: "รถตู้",
  TRUCK_4W: "รถบรรทุก 4 ล้อ",
  TRUCK_6W: "รถบรรทุก 6 ล้อ",
  TRUCK_10W: "รถบรรทุก 10 ล้อ",
  TRAILER: "รถพ่วง/หัวลาก",
  OTHER: "อื่น ๆ",
};

export const STAMP_STATUS_LABEL: Record<StampStatus, string> = {
  NOT_REQUIRED: "ไม่ต้องประทับตรา",
  PENDING: "รอ Host อนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
};

/** สถานะ E-Stamp ตามประเภทสถานที่ — หมู่บ้านใช้คำว่า "ลูกบ้าน" */
export const stampStatusLabel = (mode: SiteMode, s: StampStatus) =>
  mode === "VILLAGE" ? STAMP_STATUS_LABEL[s].replace("Host อนุมัติ", "ลูกบ้านยืนยัน") : STAMP_STATUS_LABEL[s];
