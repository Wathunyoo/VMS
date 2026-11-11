import type { HouseQuota } from "@/domain/org/house-quota";
import type { SiteMode } from "@/domain/visit/types";
import type { DirectoryInput } from "../onboarding/onboarding.usecase";

export interface SiteRow {
  id: string;
  code: string;
  name: string;
  mode: SiteMode;
  /** null = ไม่จำกัดเวลา */
  defaultMaxStayMinutes: number | null;
  inductionVersion: string | null;
  units: number;
  people: number;
}

/** บริษัทผู้เช่า / บ้าน / อาคาร (ตาราง Tenant) */
export interface UnitRow {
  id: string;
  name: string;
  floor: string;
  unit: string | null;
  phone: string | null;
  isActive: boolean;
  people: number;
}

/** Host / ลูกบ้าน (ตาราง Host) */
export interface PersonRow {
  id: string;
  fullName: string;
  department: string | null;
  tenantId: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  lineLinked: boolean;
}

export interface BayRow {
  id: string;
  code: string;
  name: string;
  zone: string | null;
  isActive: boolean;
}

export interface UnitInput {
  name: string;
  floor: string;
  unit: string | null;
  phone: string | null;
}
export interface PersonInput {
  fullName: string;
  department: string | null;
  tenantId: string | null;
  phone: string | null;
  email: string | null;
}
export interface BayInput {
  code: string;
  name: string;
  zone: string | null;
}
export interface SiteInput {
  name: string;
  mode: SiteMode;
  /** null = ไม่จำกัดเวลา */
  defaultMaxStayMinutes: number | null;
  inductionVersion: string | null;
}

/** รายชื่อหลักขององค์กร (ผูก orgId แล้ว) */
export interface DirectoryAdminRepository {
  /** โหมดขององค์กร (null = ยังไม่ได้เลือก) */
  orgMode(): Promise<SiteMode | null>;
  /** จำนวนบ้านตามสัญญา (โหมดหมู่บ้าน) */
  houseQuota(): Promise<HouseQuota>;
  /** สถานะบ้าน/บริษัท 1 รายการ (ใช้ตรวจโควตาตอนเปิดใช้งานอีกครั้ง) */
  unitState(id: string): Promise<{ isActive: boolean; siteMode: SiteMode } | null>;
  sites(): Promise<SiteRow[]>;
  site(id: string): Promise<SiteRow | null>;
  createSite(s: SiteInput): Promise<string>;
  updateSite(id: string, s: Omit<SiteInput, "mode">): Promise<boolean>;

  units(siteId: string): Promise<UnitRow[]>;
  unitInSite(id: string, siteId: string): Promise<boolean>;
  createUnit(siteId: string, u: UnitInput): Promise<string>;
  updateUnit(id: string, u: Partial<UnitInput> & { isActive?: boolean }): Promise<boolean>;

  people(siteId: string): Promise<PersonRow[]>;
  personSite(id: string): Promise<string | null>;
  createPerson(siteId: string, p: PersonInput): Promise<string>;
  updatePerson(id: string, p: Partial<PersonInput> & { isActive?: boolean }): Promise<boolean>;

  bays(siteId: string): Promise<BayRow[]>;
  createBay(siteId: string, b: BayInput): Promise<string>;
  updateBay(id: string, b: Partial<BayInput> & { isActive?: boolean }): Promise<boolean>;

  /** นำเข้าจากข้อความที่วาง — ข้ามรายการที่มีชื่อซ้ำในสถานที่เดียวกัน */
  importDirectory(siteId: string, d: DirectoryInput): Promise<{ units: number; people: number; bays: number; skipped: number }>;
}
