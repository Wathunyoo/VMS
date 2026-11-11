export type StaffRole = "ADMIN" | "STAFF";

export type OrgStatus = "PENDING" | "TRIAL" | "ACTIVE" | "SUSPENDED";

export interface OrganizationRecord {
  id: string;
  slug: string;
  name: string;
  status: OrgStatus;
  trialEndsAt: Date | null;
  onboardedAt: Date | null;
}

export interface OrganizationRepository {
  findBySlug(slug: string): Promise<OrganizationRecord | null>;
}

export interface StaffUserRecord {
  id: string;
  organizationId: string;
  username: string;
  fullName: string;
  role: StaffRole;
  passwordHash: string;
  mustChangePassword: boolean;
  isActive: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  /** จุด Check-in ประจำ */
  checkInPointId: string | null;
}

/** ข้อมูลผู้ใช้ที่ส่งให้ UI ได้ (ไม่มี hash) */
export interface StaffUserView {
  id: string;
  username: string;
  fullName: string;
  role: StaffRole;
  mustChangePassword: boolean;
  isActive: boolean;
  locked: boolean;
  lastLoginText: string | null;
  checkInPointId: string | null;
}

export interface CurrentStaff {
  id: string;
  organizationId: string;
  orgSlug: string;
  orgName: string;
  orgStatus: OrgStatus;
  /** วันที่เหลือของช่วงทดลอง (null = ไม่ใช่ช่วงทดลอง) */
  trialDaysLeft: number | null;
  /** ยังไม่ได้ตั้งค่าเริ่มต้น (ผู้ดูแลต้องผ่าน onboarding) */
  needsOnboarding: boolean;
  username: string;
  fullName: string;
  role: StaffRole;
  mustChangePassword: boolean;
  /** จุด Check-in ประจำ — เข้าระบบแล้วเครื่องนี้เป็นจุดนั้น */
  checkInPointId?: string | null;
}

export interface StaffRepository {
  findByUsername(username: string): Promise<StaffUserRecord | null>;
  findById(id: string): Promise<StaffUserRecord | null>;
  list(): Promise<StaffUserRecord[]>;
  create(data: { username: string; fullName: string; role: StaffRole; passwordHash: string; checkInPointId?: string | null }): Promise<StaffUserRecord>;
  update(
    id: string,
    data: Partial<Pick<StaffUserRecord, "passwordHash" | "mustChangePassword" | "isActive" | "role" | "fullName" | "checkInPointId">>,
  ): Promise<void>;
  /** จุด Check-in นี้อยู่ในองค์กรและยังใช้งานอยู่ */
  pointActive(pointId: string): Promise<boolean>;
  recordFailedLogin(id: string, lockUntil: Date | null): Promise<void>;
  recordSuccessfulLogin(id: string, at: Date): Promise<void>;
  /** ล้างจำนวนครั้งที่ผิดและปลดล็อก */
  unlock(id: string): Promise<void>;
  /** ลบ session ทั้งหมดของผู้ใช้ (ยกเว้น session ปัจจุบันถ้าระบุ) */
  revokeSessions(userId: string, exceptSessionId?: string): Promise<void>;
}

export interface PasswordService {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
  generateTemp(): string;
}
