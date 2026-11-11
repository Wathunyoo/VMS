import type {
  CurrentStaff,
  OrganizationRecord,
  OrganizationRepository,
  PasswordService,
  StaffRepository,
  StaffRole,
  StaffUserRecord,
  StaffUserView,
} from "./auth.types";

export interface AuthDeps {
  orgs: OrganizationRepository;
  /** repository ผู้ใช้ขององค์กร (แยกข้อมูลต่อองค์กร) */
  users: (organizationId: string) => StaffRepository;
  passwords: PasswordService;
  now?: () => Date;
}

export class AuthError extends Error {}

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const GENERIC_LOGIN_ERROR = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";

// hash จำลอง — ใช้ตรวจเมื่อไม่พบผู้ใช้ เพื่อให้เวลาตอบสนองเท่ากัน (กันการเดาชื่อผู้ใช้)
let dummyHash: Promise<string> | null = null;

const fmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
  return /^[a-z0-9._-]{3,32}$/.test(username) ? null : "ชื่อผู้ใช้ต้องเป็น a-z, 0-9, . _ - ความยาว 3–32 ตัว";
}

export function validatePassword(password: string, username?: string): string | null {
  if (password.length < 8) return "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร";
  if (password.length > 128) return "รหัสผ่านยาวเกินไป";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข";
  if (username && password.toLowerCase().includes(username.toLowerCase())) return "รหัสผ่านต้องไม่มีชื่อผู้ใช้อยู่ในนั้น";
  return null;
}

export function normalizeOrgSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function toCurrentStaff(
  u: StaffUserRecord,
  org: Pick<OrganizationRecord, "slug" | "name" | "status" | "trialEndsAt" | "onboardedAt">,
  now = new Date(),
): CurrentStaff {
  return {
    id: u.id,
    organizationId: u.organizationId,
    orgSlug: org.slug,
    orgName: org.name,
    orgStatus: org.status,
    trialDaysLeft:
      org.status === "TRIAL" && org.trialEndsAt
        ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / 86_400_000))
        : null,
    needsOnboarding: !org.onboardedAt,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    checkInPointId: u.checkInPointId ?? null,
  };
}

function toView(u: StaffUserRecord, now: Date): StaffUserView {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    isActive: u.isActive,
    locked: !!u.lockedUntil && u.lockedUntil > now,
    lastLoginText: u.lastLoginAt ? fmt.format(u.lastLoginAt) : null,
    checkInPointId: u.checkInPointId ?? null,
  };
}

// ---------------- Login ----------------

export async function login(
  orgSlugRaw: string,
  usernameRaw: string,
  password: string,
  deps: AuthDeps,
): Promise<CurrentStaff> {
  const now = deps.now?.() ?? new Date();
  const slug = normalizeOrgSlug(orgSlugRaw);
  const org = slug ? await deps.orgs.findBySlug(slug) : null;
  const username = normalizeUsername(usernameRaw);
  const users = org ? deps.users(org.id) : null;
  const user = users && username ? await users.findByUsername(username) : null;

  // ไม่บอกว่าผิดที่องค์กร / ชื่อผู้ใช้ / รหัส — กันการเดา
  if (!org || !users || !user || !user.isActive) {
    dummyHash ??= deps.passwords.hash("dummy-password-0");
    await deps.passwords.verify(password, await dummyHash);
    throw new AuthError(GENERIC_LOGIN_ERROR);
  }
  if (org.status === "SUSPENDED") throw new AuthError("บัญชีองค์กรถูกระงับการใช้งาน กรุณาติดต่อผู้ให้บริการ");
  if (org.status === "PENDING") throw new AuthError("กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ — ตรวจกล่องจดหมายที่ใช้สมัคร");

  if (user.lockedUntil && user.lockedUntil > now) {
    const mins = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
    throw new AuthError(`บัญชีถูกล็อกชั่วคราวเพราะกรอกรหัสผิดหลายครั้ง — ลองใหม่ในอีก ${mins} นาที หรือติดต่อผู้ดูแลระบบ`);
  }

  if (!(await deps.passwords.verify(password, user.passwordHash))) {
    const failures = user.failedLoginCount + 1;
    const lock = failures >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
    await users.recordFailedLogin(user.id, lock);
    throw new AuthError(
      lock ? `กรอกรหัสผิด ${MAX_FAILED_LOGINS} ครั้ง — บัญชีถูกล็อก ${LOCK_MINUTES} นาที` : GENERIC_LOGIN_ERROR,
    );
  }

  await users.recordSuccessfulLogin(user.id, now);
  return toCurrentStaff(user, org, now);
}

// ---------------- Own password ----------------

export async function changeOwnPassword(
  actor: CurrentStaff,
  input: { current: string; next: string; confirm: string },
  currentSessionId: string,
  deps: AuthDeps,
): Promise<void> {
  const users = deps.users(actor.organizationId);
  const userId = actor.id;
  const user = await users.findById(userId);
  if (!user) throw new AuthError("ไม่พบผู้ใช้");
  if (!(await deps.passwords.verify(input.current, user.passwordHash))) throw new AuthError("รหัสผ่านปัจจุบันไม่ถูกต้อง");
  if (input.next !== input.confirm) throw new AuthError("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
  if (input.next === input.current) throw new AuthError("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม");
  const problem = validatePassword(input.next, user.username);
  if (problem) throw new AuthError(problem);

  await users.update(userId, { passwordHash: await deps.passwords.hash(input.next), mustChangePassword: false });
  // ออกจากระบบอุปกรณ์อื่นทั้งหมด
  await users.revokeSessions(userId, currentSessionId);
}

// ---------------- Admin: manage staff ----------------

function requireAdminRole(actor: CurrentStaff) {
  if (actor.role !== "ADMIN") throw new AuthError("ไม่มีสิทธิ์จัดการผู้ใช้");
}

export async function listStaff(actor: CurrentStaff, deps: AuthDeps): Promise<StaffUserView[]> {
  requireAdminRole(actor);
  const now = deps.now?.() ?? new Date();
  return (await deps.users(actor.organizationId).list()).map((u) => toView(u, now));
}

/** คืนรหัสผ่านชั่วคราว (แสดงให้แอดมินครั้งเดียว) */
export async function createStaff(
  actor: CurrentStaff,
  input: { username: string; fullName: string; role: StaffRole; checkInPointId?: string | null },
  deps: AuthDeps,
): Promise<{ user: StaffUserView; tempPassword: string }> {
  requireAdminRole(actor);
  const username = normalizeUsername(input.username);
  const problem = validateUsername(username);
  if (problem) throw new AuthError(problem);
  const fullName = input.fullName.trim();
  if (fullName.length < 2) throw new AuthError("กรุณากรอกชื่อ-นามสกุล");
  if (input.role !== "ADMIN" && input.role !== "STAFF") throw new AuthError("บทบาทไม่ถูกต้อง");
  const users = deps.users(actor.organizationId);
  if (await users.findByUsername(username)) throw new AuthError(`ชื่อผู้ใช้ "${username}" มีอยู่แล้ว`);
  const checkInPointId = input.checkInPointId || null;
  if (checkInPointId && !(await users.pointActive(checkInPointId))) throw new AuthError("ไม่พบจุด Check-in นี้");

  const tempPassword = deps.passwords.generateTemp();
  const user = await users.create({
    username,
    fullName,
    role: input.role,
    passwordHash: await deps.passwords.hash(tempPassword),
    checkInPointId,
  });
  return { user: toView(user, deps.now?.() ?? new Date()), tempPassword };
}

export async function resetStaffPassword(actor: CurrentStaff, userId: string, deps: AuthDeps): Promise<string> {
  requireAdminRole(actor);
  const users = deps.users(actor.organizationId);
  const user = await users.findById(userId);
  if (!user) throw new AuthError("ไม่พบผู้ใช้");
  const tempPassword = deps.passwords.generateTemp();
  await users.update(userId, { passwordHash: await deps.passwords.hash(tempPassword), mustChangePassword: true });
  // ปลดล็อก + บังคับ login ใหม่ทุกอุปกรณ์
  await users.unlock(userId);
  await users.revokeSessions(userId);
  return tempPassword;
}

/** ตั้ง/เปลี่ยน/ยกเลิก จุด Check-in ประจำของเจ้าหน้าที่ (มีผลตอนเข้าระบบครั้งถัดไป) */
export async function setStaffPoint(actor: CurrentStaff, userId: string, pointId: string | null, deps: AuthDeps): Promise<void> {
  requireAdminRole(actor);
  const users = deps.users(actor.organizationId);
  if (!(await users.findById(userId))) throw new AuthError("ไม่พบผู้ใช้");
  if (pointId && !(await users.pointActive(pointId))) throw new AuthError("ไม่พบจุด Check-in นี้");
  await users.update(userId, { checkInPointId: pointId || null });
}

export async function setStaffActive(actor: CurrentStaff, userId: string, active: boolean, deps: AuthDeps): Promise<void> {
  requireAdminRole(actor);
  if (userId === actor.id && !active) throw new AuthError("ไม่สามารถปิดใช้งานบัญชีของตัวเองได้");
  const users = deps.users(actor.organizationId);
  if (!(await users.findById(userId))) throw new AuthError("ไม่พบผู้ใช้");
  await users.update(userId, { isActive: active });
  if (!active) await users.revokeSessions(userId);
}
