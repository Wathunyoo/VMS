import { houseQuotaProblem } from "@/domain/org/house-quota";
import { SITE_MODES, type SiteMode } from "@/domain/visit/types";
import type { CurrentStaff } from "../auth/auth.types";
import { parseDirectory } from "../onboarding/onboarding.usecase";
import type { BayInput, DirectoryAdminRepository, PersonInput, SiteInput, UnitInput } from "./directory-admin.types";

export class DirectoryError extends Error {}

export interface DirectoryAdminDeps {
  repo: DirectoryAdminRepository;
}

function requireAdmin(actor: CurrentStaff) {
  if (actor.role !== "ADMIN") throw new DirectoryError("เฉพาะผู้ดูแลระบบ");
}

const clean = (v: unknown, max: number) => {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s.length ? s.slice(0, max) : null;
};

/** บ้านเกินจำนวนตามสัญญา → ไม่ให้เพิ่ม/เปิดใช้งาน */
async function requireHouseQuota(adding: number, deps: DirectoryAdminDeps) {
  const problem = houseQuotaProblem(await deps.repo.houseQuota(), adding);
  if (problem) throw new DirectoryError(problem);
}

async function requireSite(id: string, deps: DirectoryAdminDeps) {
  const site = await deps.repo.site(id);
  if (!site) throw new DirectoryError("ไม่พบสถานที่");
  return site;
}

// ---------------- Sites ----------------

/** maxStayHours: null หรือ 0 = ไม่จำกัดเวลา */
export function validateSite(raw: { name: string; mode: string; maxStayHours: number | null; inductionVersion?: string | null }): SiteInput {
  const name = clean(raw.name, 120);
  if (!name || name.length < 2) throw new DirectoryError("กรุณากรอกชื่อสถานที่");
  if (!(SITE_MODES as readonly string[]).includes(raw.mode)) throw new DirectoryError("กรุณาเลือกประเภทสถานที่");
  const unlimited = raw.maxStayHours == null || Number(raw.maxStayHours) === 0;
  const hours = Number(raw.maxStayHours);
  if (!unlimited && (!Number.isFinite(hours) || hours < 0.5 || hours > 168)) throw new DirectoryError("เวลาอยู่ได้สูงสุดต้องอยู่ระหว่าง 0.5–168 ชม. หรือเลือกไม่จำกัดเวลา");
  return {
    name,
    mode: raw.mode as SiteMode,
    defaultMaxStayMinutes: unlimited ? null : Math.round(hours * 60),
    inductionVersion: raw.mode === "FACTORY" ? clean(raw.inductionVersion, 40) : null,
  };
}

export async function createSite(actor: CurrentStaff, raw: Parameters<typeof validateSite>[0], deps: DirectoryAdminDeps) {
  requireAdmin(actor);
  // 1 องค์กร = 1 โหมด — สถานที่ใหม่ใช้โหมดขององค์กรเสมอ
  const s = validateSite({ ...raw, mode: (await deps.repo.orgMode()) ?? raw.mode });
  if ((await deps.repo.sites()).length >= 50) throw new DirectoryError("เพิ่มสถานที่ได้สูงสุด 50 แห่ง");
  return deps.repo.createSite(s);
}

export async function updateSite(actor: CurrentStaff, id: string, raw: Parameters<typeof validateSite>[0], deps: DirectoryAdminDeps) {
  requireAdmin(actor);
  const site = await requireSite(id, deps);
  const { mode: _ignored, ...s } = validateSite({ ...raw, mode: site.mode }); // เปลี่ยนประเภทภายหลังไม่ได้ (ประวัติเดิมผูกกับโหมด)
  if (!(await deps.repo.updateSite(id, s))) throw new DirectoryError("ไม่พบสถานที่");
}

// ---------------- Units (บริษัท / บ้าน / อาคาร) ----------------

function validateUnit(raw: Partial<UnitInput>, mode: SiteMode): UnitInput {
  const name = clean(raw.name, 120);
  if (!name) throw new DirectoryError(mode === "VILLAGE" ? "กรุณากรอกบ้านเลขที่" : "กรุณากรอกชื่อ");
  const phone = clean(raw.phone, 20);
  if (phone && !/^[0-9+\-\s]{3,20}$/.test(phone)) throw new DirectoryError("เบอร์โทรไม่ถูกต้อง");
  return { name, floor: clean(raw.floor, 30) ?? "-", unit: clean(raw.unit, 60), phone };
}

export async function saveUnit(actor: CurrentStaff, siteId: string, id: string | null, raw: Partial<UnitInput>, deps: DirectoryAdminDeps) {
  requireAdmin(actor);
  const site = await requireSite(siteId, deps);
  const u = validateUnit(raw, site.mode);
  const dup = (await deps.repo.units(siteId)).find((x) => x.id !== id && x.isActive && x.name.toLowerCase() === u.name.toLowerCase());
  if (dup) throw new DirectoryError(`มี “${u.name}” อยู่แล้ว`);
  if (!id) {
    if (site.mode === "VILLAGE") await requireHouseQuota(1, deps);
    return deps.repo.createUnit(siteId, u);
  }
  if (!(await deps.repo.unitInSite(id, siteId)) || !(await deps.repo.updateUnit(id, u))) throw new DirectoryError("ไม่พบรายการ");
  return id;
}

export async function setUnitActive(actor: CurrentStaff, id: string, isActive: boolean, deps: DirectoryAdminDeps) {
  requireAdmin(actor);
  if (isActive) {
    const st = await deps.repo.unitState(id);
    if (st && !st.isActive && st.siteMode === "VILLAGE") await requireHouseQuota(1, deps);
  }
  if (!(await deps.repo.updateUnit(id, { isActive }))) throw new DirectoryError("ไม่พบรายการ");
}

// ---------------- People (Host / ลูกบ้าน) ----------------

function validatePerson(raw: Partial<PersonInput>): PersonInput {
  const fullName = clean(raw.fullName, 120);
  if (!fullName || fullName.length < 2) throw new DirectoryError("กรุณากรอกชื่อ-นามสกุล");
  const phone = clean(raw.phone, 20);
  if (phone && !/^[0-9+\-\s]{3,20}$/.test(phone)) throw new DirectoryError("เบอร์โทรไม่ถูกต้อง");
  const email = clean(raw.email, 120)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new DirectoryError("อีเมลไม่ถูกต้อง");
  return { fullName, department: clean(raw.department, 80), tenantId: clean(raw.tenantId, 40), phone, email };
}

export async function savePerson(actor: CurrentStaff, siteId: string, id: string | null, raw: Partial<PersonInput>, deps: DirectoryAdminDeps) {
  requireAdmin(actor);
  const site = await requireSite(siteId, deps);
  const p = validatePerson(raw);
  if (site.mode === "VILLAGE" && !p.tenantId) throw new DirectoryError("กรุณาเลือกบ้านของลูกบ้าน");
  // อ้างอิงบ้าน/บริษัทได้เฉพาะในสถานที่เดียวกัน (กันอ้างข้ามองค์กร)
  if (p.tenantId && !(await deps.repo.unitInSite(p.tenantId, siteId))) throw new DirectoryError("บริษัท/บ้านที่เลือกไม่ถูกต้อง");
  if (!id) return deps.repo.createPerson(siteId, p);
  if ((await deps.repo.personSite(id)) !== siteId || !(await deps.repo.updatePerson(id, p))) throw new DirectoryError("ไม่พบรายการ");
  return id;
}

export async function setPersonActive(actor: CurrentStaff, id: string, isActive: boolean, deps: DirectoryAdminDeps) {
  requireAdmin(actor);
  if (!(await deps.repo.updatePerson(id, { isActive }))) throw new DirectoryError("ไม่พบรายการ");
}

// ---------------- Loading bays ----------------

function validateBay(raw: Partial<BayInput>): BayInput {
  const code = clean(raw.code, 20)?.toUpperCase();
  if (!code) throw new DirectoryError("กรุณากรอกรหัสจุดขนถ่าย");
  return { code, name: clean(raw.name, 80) ?? code, zone: clean(raw.zone, 40) };
}

export async function saveBay(actor: CurrentStaff, siteId: string, id: string | null, raw: Partial<BayInput>, deps: DirectoryAdminDeps) {
  requireAdmin(actor);
  const site = await requireSite(siteId, deps);
  if (site.mode !== "FACTORY") throw new DirectoryError("จุดขนถ่ายสินค้าใช้กับโรงงานเท่านั้น");
  const b = validateBay(raw);
  if ((await deps.repo.bays(siteId)).some((x) => x.id !== id && x.code === b.code)) throw new DirectoryError(`มีรหัส ${b.code} อยู่แล้ว`);
  if (!id) return deps.repo.createBay(siteId, b);
  if (!(await deps.repo.updateBay(id, b))) throw new DirectoryError("ไม่พบรายการ");
  return id;
}

export async function setBayActive(actor: CurrentStaff, id: string, isActive: boolean, deps: DirectoryAdminDeps) {
  requireAdmin(actor);
  if (!(await deps.repo.updateBay(id, { isActive }))) throw new DirectoryError("ไม่พบรายการ");
}

// ---------------- Import ----------------

export async function importDirectory(
  actor: CurrentStaff,
  siteId: string,
  text: { tenants: string; hosts: string; bays: string },
  deps: DirectoryAdminDeps,
) {
  requireAdmin(actor);
  const site = await requireSite(siteId, deps);
  const d = parseDirectory(text, site.mode);
  if (site.mode !== "FACTORY") d.bays = [];
  if (!d.tenants.length && !d.hosts.length && !d.bays.length) throw new DirectoryError("ไม่มีรายการให้นำเข้า");
  if (site.mode === "VILLAGE" && d.tenants.length) {
    // นับเฉพาะบ้านใหม่ (ชื่อซ้ำกับที่มีอยู่จะถูกข้าม)
    const existing = new Set((await deps.repo.units(siteId)).map((u) => u.name.toLowerCase()));
    const fresh = new Set(d.tenants.map((x) => x.name.toLowerCase()).filter((n) => !existing.has(n)));
    await requireHouseQuota(fresh.size, deps);
  }
  return deps.repo.importDirectory(siteId, d);
}
