import { contractDateFromYmd } from "@/domain/org/contract";
import { MAX_CONTRACT_HOUSES } from "@/domain/org/house-quota";
import { validateOrgSlug } from "@/domain/org/slug";
import { BillingError, validateProfile } from "../billing/billing.usecase";
import type { BillingProfileData } from "../billing/billing.types";
import { SITE_MODES, type SiteMode } from "@/domain/visit/types";
import type { PasswordService } from "../auth/auth.types";
import { normalizeOrgSlug, normalizeUsername, validateUsername } from "../auth/auth.usecase";

/**
 * ลูกค้า (องค์กร) — ผู้ให้บริการสร้างให้ตอนติดตั้งที่หน้างาน (ไม่มีการสมัครใช้งานเอง)
 * ผู้ดูแลของลูกค้าได้รหัสชั่วคราว → login ครั้งแรกตั้งรหัสใหม่ → ตั้งค่าเริ่มต้น (สถานที่/รายชื่อ)
 */
export interface CustomerRow {
  id: string;
  slug: string;
  name: string;
  mode: SiteMode | null;
  status: "PENDING" | "TRIAL" | "ACTIVE" | "SUSPENDED";
  trialEndsAt: Date | null;
  paidUntil: Date | null;
  onboardedAt: Date | null;
  contactEmail: string | null;
  /** จำนวนจุดลงทะเบียน (Check-in) ตามสัญญา */
  pointLimit: number;
  /** จุดที่ลงทะเบียนเครื่องแล้ว */
  activePoints: number;
  /** จำนวนบ้านตามสัญญา (หมู่บ้าน) — null = ไม่จำกัด */
  houseLimit: number | null;
  /** บ้านที่เปิดใช้งานอยู่ */
  activeHouses: number;
  /** วันสิ้นสุดสัญญา (null = ยังไม่ระบุ) */
  contractEndsAt: Date | null;
  /** ข้อมูลออกใบกำกับภาษี (null = ยังไม่ได้กรอก) */
  billing: BillingProfileData | null;
  createdAt: Date;
  admins: string[];
  sites: number;
  lastVisitAt: Date | null;
}

export interface NewCustomer {
  slug: string;
  name: string;
  mode: SiteMode;
  contactEmail: string | null;
  status: "TRIAL" | "ACTIVE";
  trialEndsAt: Date | null;
  adminUsername: string;
  adminFullName: string;
  adminPasswordHash: string;
  pointLimit: number;
  houseLimit: number | null;
  contractEndsAt: Date | null;
  billing: BillingProfileData;
}

/** ข้อมูลตามสัญญา — แก้ไขได้ภายหลัง */
export interface CustomerContract {
  contactEmail: string;
  pointLimit: number;
  /** หมู่บ้าน: จำนวนบ้านตามสัญญา · โหมดอื่น: null */
  houseLimit: number | null;
  /** วันสิ้นสุดสัญญา (null = ไม่ระบุ) */
  contractEndsAt: Date | null;
  billing: BillingProfileData;
}

export interface CustomersRepository {
  list(): Promise<CustomerRow[]>;
  slugTaken(slug: string): Promise<boolean>;
  create(c: NewCustomer): Promise<string>;
  updateContract(orgId: string, c: CustomerContract): Promise<boolean>;
  /** โหมดขององค์กร (null = ไม่พบ / ยังไม่กำหนด) */
  modeOf(orgId: string): Promise<{ mode: SiteMode | null } | null>;
  /** ลูกค้า (ไม่รวมที่ถูกระงับและองค์กรผู้ให้บริการ) ที่สัญญาสิ้นสุดภายในวันที่ before */
  renewalsDue(before: Date, platformSlug: string): Promise<number>;
  suspend(id: string): Promise<boolean>;
  /** ยกเลิกการระงับ — กลับเป็นทดลองใช้ (ถ้ายังไม่เคยชำระ) หรือใช้งาน */
  resume(id: string): Promise<boolean>;
  /** รีเซ็ตรหัสผู้ดูแล: บังคับเปลี่ยนรหัส ปลดล็อก และออกจากระบบทุกเครื่อง */
  resetAdminPassword(orgId: string, username: string, passwordHash: string): Promise<boolean>;
}

export interface CustomersDeps {
  repo: CustomersRepository;
  passwords: PasswordService;
  /** องค์กรของผู้ให้บริการ — ระงับไม่ได้ */
  platformOrgSlug: string;
  now?: () => Date;
}

export class CustomerError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MAX_CONTRACT_POINTS = 999;

export interface ContractInput {
  contactEmail?: string;
  pointLimit?: number;
  /** หมู่บ้าน: จำนวนบ้านตามสัญญา (บังคับ) */
  houseLimit?: number | null;
  /** "YYYY-MM-DD" (เวลาไทย) หรือว่าง = ไม่ระบุ */
  contractEndsAt?: string;
  legalName?: string;
  taxId?: string;
  /** "" หรือ "สำนักงานใหญ่" = สำนักงานใหญ่, ตัวเลข = สาขาที่ (5 หลัก) */
  branch?: string;
  address?: string;
}

/** ตรวจจำนวนจุด + ข้อมูลใบกำกับภาษี (อีเมลติดต่อ = อีเมลรับเอกสาร) */
export function validateContract(input: ContractInput, mode: SiteMode | null): CustomerContract {
  const points = Number(input.pointLimit);
  if (!Number.isInteger(points) || points < 1 || points > MAX_CONTRACT_POINTS) {
    throw new CustomerError(`จำนวนจุดลงทะเบียนต้องเป็นจำนวนเต็ม 1–${MAX_CONTRACT_POINTS}`);
  }
  let houseLimit: number | null = null;
  if (mode === "VILLAGE") {
    houseLimit = Number(input.houseLimit);
    if (input.houseLimit == null || !Number.isInteger(houseLimit) || houseLimit < 1 || houseLimit > MAX_CONTRACT_HOUSES) {
      throw new CustomerError(`กรุณากำหนดจำนวนบ้านตามสัญญา (จำนวนเต็ม 1–${MAX_CONTRACT_HOUSES.toLocaleString("en-US")})`);
    }
  }
  let contractEndsAt: Date | null = null;
  const endRaw = (input.contractEndsAt ?? "").trim();
  if (endRaw) {
    contractEndsAt = contractDateFromYmd(endRaw);
    const y = contractEndsAt ? Number(endRaw.slice(0, 4)) : 0;
    if (!contractEndsAt || y < 2000 || y > 2200) throw new CustomerError("วันสิ้นสุดสัญญาไม่ถูกต้อง (ใช้ปี ค.ศ.)");
  }
  const email = (input.contactEmail ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new CustomerError("กรุณากรอกอีเมลติดต่อ (ใช้รับใบกำกับภาษี)");
  const rawBranch = (input.branch ?? "").trim();
  let branch = "สำนักงานใหญ่";
  if (rawBranch && rawBranch !== "สำนักงานใหญ่") {
    const digits = rawBranch.replace(/\D/g, "");
    if (!/^\d{1,5}$/.test(digits) || Number(digits) === 0) throw new CustomerError("เลขที่สาขาต้องเป็นตัวเลข 1–5 หลัก เช่น 00001");
    branch = `สาขาที่ ${digits.padStart(5, "0")}`;
  }
  try {
    const billing = validateProfile({
      legalName: input.legalName ?? "",
      taxId: input.taxId ?? "",
      branch,
      address: input.address ?? "",
      billingEmail: email,
    });
    return { contactEmail: email, pointLimit: points, houseLimit, contractEndsAt, billing };
  } catch (e) {
    if (e instanceof BillingError) throw new CustomerError(e.message);
    throw e;
  }
}

export async function createCustomer(
  input: { name: string; slug: string; mode: string; adminUsername?: string; plan: string; trialDays?: number } & ContractInput,
  deps: CustomersDeps,
): Promise<{ orgId: string; slug: string; username: string; tempPassword: string }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) throw new CustomerError("กรุณากรอกชื่อลูกค้า");
  const slug = normalizeOrgSlug(input.slug);
  const slugProblem = validateOrgSlug(slug);
  if (slugProblem) throw new CustomerError(slugProblem);
  if (await deps.repo.slugTaken(slug)) throw new CustomerError(`รหัสองค์กร "${slug}" ถูกใช้แล้ว`);
  if (!(SITE_MODES as readonly string[]).includes(input.mode)) throw new CustomerError("กรุณาเลือกประเภทธุรกิจ");
  const contract = validateContract(input, input.mode as SiteMode);
  const username = normalizeUsername(input.adminUsername || "admin");
  const userProblem = validateUsername(username);
  if (userProblem) throw new CustomerError(userProblem);

  let status: "TRIAL" | "ACTIVE";
  let trialEndsAt: Date | null = null;
  if (input.plan === "TRIAL") {
    const days = Math.trunc(Number(input.trialDays ?? 30));
    if (!Number.isFinite(days) || days < 1 || days > 365) throw new CustomerError("ระยะทดลองใช้ต้องอยู่ระหว่าง 1–365 วัน");
    status = "TRIAL";
    trialEndsAt = new Date((deps.now?.() ?? new Date()).getTime() + days * 86_400_000);
  } else if (input.plan === "ACTIVE") {
    status = "ACTIVE"; // ไม่มีวันหมดอายุ = สัญญาพิเศษ / เก็บเงินนอกระบบ จนกว่าจะออกใบแจ้งหนี้
  } else {
    throw new CustomerError("กรุณาเลือกสถานะเริ่มต้น");
  }

  const tempPassword = deps.passwords.generateTemp();
  const orgId = await deps.repo.create({
    slug,
    name,
    mode: input.mode as SiteMode,
    contactEmail: contract.contactEmail,
    pointLimit: contract.pointLimit,
    houseLimit: contract.houseLimit,
    contractEndsAt: contract.contractEndsAt,
    billing: contract.billing,
    status,
    trialEndsAt,
    adminUsername: username,
    adminFullName: "ผู้ดูแลระบบ",
    adminPasswordHash: await deps.passwords.hash(tempPassword),
  });
  return { orgId, slug, username, tempPassword };
}

export async function updateCustomerContract(orgId: string, input: ContractInput, deps: CustomersDeps) {
  const org = await deps.repo.modeOf(orgId);
  if (!org) throw new CustomerError("ไม่พบลูกค้า");
  const contract = validateContract(input, org.mode);
  if (!(await deps.repo.updateContract(orgId, contract))) throw new CustomerError("ไม่พบลูกค้า");
}

export async function suspendCustomer(orgId: string, slug: string, deps: CustomersDeps) {
  if (slug === deps.platformOrgSlug) throw new CustomerError("ระงับองค์กรของผู้ให้บริการไม่ได้");
  if (!(await deps.repo.suspend(orgId))) throw new CustomerError("ไม่พบลูกค้า");
}

export async function resumeCustomer(orgId: string, deps: CustomersDeps) {
  if (!(await deps.repo.resume(orgId))) throw new CustomerError("ไม่พบลูกค้า หรือไม่ได้ถูกระงับ");
}

export async function resetCustomerAdmin(orgId: string, username: string, deps: CustomersDeps) {
  const tempPassword = deps.passwords.generateTemp();
  if (!(await deps.repo.resetAdminPassword(orgId, normalizeUsername(username), await deps.passwords.hash(tempPassword)))) {
    throw new CustomerError("ไม่พบผู้ดูแลของลูกค้ารายนี้");
  }
  return { tempPassword };
}
