import type { GuestInviteStatus, InviteInput, InviteState } from "@/domain/invite/guest-invite";
import type { SiteMode } from "@/domain/visit/types";

/** ลูกบ้าน/Host ที่เปิดลิงก์ "แจ้งแขก" */
export interface ResidentRecord {
  id: string;
  organizationId: string;
  fullName: string;
  lineUserId: string | null;
  isActive: boolean;
  orgSuspended: boolean;
  siteId: string;
  siteName: string;
  mode: SiteMode;
  tenant: { id: string; name: string; floor: string; unit: string | null } | null;
}

export interface InviteRecord {
  id: string;
  token: string;
  siteId: string;
  siteName: string;
  mode: SiteMode;
  tenantId: string | null;
  tenant: { name: string; floor: string; unit: string | null } | null;
  hostId: string;
  hostName: string;
  guestName: string | null;
  plateNumber: string | null;
  note: string | null;
  validFrom: Date;
  validUntil: Date;
  status: GuestInviteStatus;
  usedAt: Date | null;
}

/** ใช้จากหน้าสาธารณะ (ลูกบ้าน/แขก) — ไม่ผูกองค์กรล่วงหน้า สิทธิ์มาจาก token */
export interface PublicInviteRepository {
  findResident(hostId: string): Promise<ResidentRecord | null>;
  countOpen(hostId: string, now: Date): Promise<number>;
  create(resident: ResidentRecord, input: InviteInput, token: string): Promise<InviteRecord>;
  /** รายการของผู้แจ้งที่ยังไม่หมดเวลา หรือหมดเวลาหลัง since */
  listForHost(hostId: string, since: Date): Promise<InviteRecord[]>;
  /** ยกเลิกได้เฉพาะรายการของตัวเองที่ยังไม่ใช้ — คืน false ถ้าไม่พบ */
  cancel(hostId: string, inviteId: string, at: Date): Promise<boolean>;
  findByToken(token: string): Promise<InviteRecord | null>;
}

/** ใช้ที่จุด รปภ. — ถูกจำกัดอยู่ในองค์กรของเจ้าหน้าที่ */
export interface StaffInviteRepository {
  findByToken(token: string): Promise<InviteRecord | null>;
  findById(id: string): Promise<InviteRecord | null>;
  /** รายการที่ยังใช้ได้ (ACTIVE) และช่วงเวลาซ้อนกับ [from, to] */
  listActiveBetween(from: Date, to: Date): Promise<InviteRecord[]>;
}

export interface InviteView {
  id: string;
  siteId: string;
  siteName: string;
  mode: SiteMode;
  tenantId: string | null;
  hostId: string;
  hostName: string;
  /** "บ้าน 99/1 · ซอย 2" */
  placeText: string;
  guestName: string | null;
  plateNumber: string | null;
  note: string | null;
  windowText: string;
  /** ISO — ใช้เรียงลำดับ */
  startsAt: string;
  state: InviteState;
  stateText: string;
  /** ข้อความเมื่อ Check-in ไม่ได้ (null = ใช้ได้) */
  problem: string | null;
}

/** รายการในหน้าของลูกบ้าน — มีลิงก์ของแขกสำหรับส่งต่อ */
export interface ResidentInviteView extends InviteView {
  guestUrl: string;
  shareText: string;
}

export interface ResidentPageView {
  hostName: string;
  placeText: string;
  siteName: string;
  invites: ResidentInviteView[];
  /** ค่าเริ่มต้นของฟอร์ม (เวลาไทย) */
  defaults: { validFrom: string; validUntil: string };
}
