import { houseQuotaProblem, type HouseQuota } from "@/domain/org/house-quota";
import { SITE_MODES, type SiteMode } from "@/domain/visit/types";
import type { CurrentStaff } from "../auth/auth.types";

/** ตั้งค่าเริ่มต้นขององค์กรใหม่: สถานที่แรก → รายชื่อผู้เช่า/Host/จุดขนถ่าย → เสร็จ */
export interface OnboardingRepository {
  status(): Promise<{
    siteCount: number;
    hostCount: number;
    tenantCount: number;
    onboarded: boolean;
    /** โหมดที่ผู้ให้บริการกำหนดตอนสร้างลูกค้า (null = ให้เลือกตอนตั้งค่า) */
    orgMode: SiteMode | null;
    firstSite: { id: string; mode: SiteMode; name: string } | null;
  }>;
  createSite(site: { code: string; name: string; mode: SiteMode; defaultMaxStayMinutes: number | null }): Promise<string>;
  addDirectory(siteId: string, d: DirectoryInput): Promise<{ tenants: number; hosts: number; bays: number }>;
  /** จำนวนบ้านตามสัญญา (โหมดหมู่บ้าน) */
  houseQuota(): Promise<HouseQuota>;
  finish(at: Date): Promise<void>;
}

export interface DirectoryInput {
  tenants: { floor: string; name: string }[];
  hosts: { fullName: string; department: string | null; tenantName: string | null }[];
  bays: { code: string; name: string }[];
}

export interface OnboardingDeps {
  repo: OnboardingRepository;
  now?: () => Date;
}

export class OnboardingError extends Error {}

const MAX_LINES = 500;

function requireAdmin(actor: CurrentStaff) {
  if (actor.role !== "ADMIN") throw new OnboardingError("เฉพาะผู้ดูแลระบบ");
}

export async function createFirstSite(
  actor: CurrentStaff,
  /** maxStayHours: null หรือ 0 = ไม่จำกัดเวลา */
  input: { name: string; mode: string; maxStayHours: number | null },
  deps: OnboardingDeps,
) {
  requireAdmin(actor);
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new OnboardingError("กรุณากรอกชื่อสถานที่");
  const st0 = await deps.repo.status();
  // ผู้ให้บริการกำหนดโหมดไว้แล้ว → ใช้โหมดนั้นเสมอ
  const mode = st0.orgMode ?? input.mode;
  if (!(SITE_MODES as readonly string[]).includes(mode)) throw new OnboardingError("กรุณาเลือกประเภทสถานที่");
  const unlimited = input.maxStayHours == null || Number(input.maxStayHours) === 0;
  const hours = Math.round(Number(input.maxStayHours));
  if (!unlimited && (!Number.isFinite(hours) || hours < 1 || hours > 168)) {
    throw new OnboardingError("เวลาอยู่ได้สูงสุดต้องอยู่ระหว่าง 1–168 ชม. หรือเลือกไม่จำกัดเวลา");
  }
  if (st0.firstSite) return st0.firstSite.id; // กดซ้ำ — ไม่สร้างซ้ำ
  return deps.repo.createSite({ code: "SITE-1", name, mode: mode as SiteMode, defaultMaxStayMinutes: unlimited ? null : hours * 60 });
}

/**
 * แปลงข้อความที่วางมา (บรรทัดละรายการ คั่นด้วย , หรือ | หรือ Tab — วางจาก Excel ได้)
 *  ผู้เช่า:  ชั้น, ชื่อบริษัท
 *  Host:    ชื่อ-นามสกุล, แผนก, ชื่อบริษัท(ถ้ามี)
 *  จุดขนถ่าย: รหัส, ชื่อ
 * หมู่บ้าน:
 *  บ้าน:     บ้านเลขที่, ซอย/โซน(ถ้ามี)
 *  ลูกบ้าน:  ชื่อ-นามสกุล, บ้านเลขที่
 */
export function parseDirectory(text: { tenants: string; hosts: string; bays: string }, mode: SiteMode = "OFFICE"): DirectoryInput {
  const rows = (s: string) =>
    s
      .split(/\r?\n/)
      .map((l) => l.split(/\t|\||,/).map((c) => c.trim().slice(0, 120)))
      .filter((c) => c.some(Boolean))
      .slice(0, MAX_LINES);
  if (mode === "VILLAGE") {
    return {
      tenants: rows(text.tenants)
        .filter((c) => c[0])
        .map(([house, soi]) => ({ name: house, floor: soi || "-" })),
      hosts: rows(text.hosts)
        .filter((c) => c[0])
        .map(([fullName, house]) => ({ fullName, department: null, tenantName: house || null })),
      bays: [],
    };
  }
  return {
    tenants: rows(text.tenants)
      .filter((c) => c[1])
      .map(([floor, name]) => ({ floor: floor || "-", name })),
    hosts: rows(text.hosts)
      .filter((c) => c[0])
      .map(([fullName, department, tenantName]) => ({ fullName, department: department || null, tenantName: tenantName || null })),
    bays: rows(text.bays)
      .filter((c) => c[0])
      .map(([code, name]) => ({ code: code.toUpperCase(), name: name || code })),
  };
}

export async function addDirectory(actor: CurrentStaff, text: { tenants: string; hosts: string; bays: string }, deps: OnboardingDeps) {
  requireAdmin(actor);
  const st = await deps.repo.status();
  if (!st.firstSite) throw new OnboardingError("กรุณาสร้างสถานที่ก่อน");
  const d = parseDirectory(text, st.firstSite.mode);
  if (st.firstSite.mode === "VILLAGE") {
    if (d.tenants.length === 0 && st.tenantCount === 0) throw new OnboardingError("กรุณาเพิ่มบ้านอย่างน้อย 1 หลัง");
    const problem = houseQuotaProblem(await deps.repo.houseQuota(), d.tenants.length);
    if (problem) throw new OnboardingError(problem);
  } else if (d.hosts.length === 0 && st.hostCount === 0) {
    throw new OnboardingError("กรุณาเพิ่ม Host (ผู้ที่ถูกเข้าพบ) อย่างน้อย 1 คน");
  }
  return deps.repo.addDirectory(st.firstSite.id, d);
}

export async function finishOnboarding(actor: CurrentStaff, deps: OnboardingDeps) {
  requireAdmin(actor);
  const st = await deps.repo.status();
  if (!st.firstSite) throw new OnboardingError("กรุณาสร้างสถานที่ก่อน");
  if (st.firstSite.mode === "VILLAGE" ? st.tenantCount === 0 : st.hostCount === 0) {
    throw new OnboardingError(st.firstSite.mode === "VILLAGE" ? "กรุณาเพิ่มบ้านอย่างน้อย 1 หลัง" : "กรุณาเพิ่ม Host อย่างน้อย 1 คน");
  }
  await deps.repo.finish(deps.now?.() ?? new Date());
}
