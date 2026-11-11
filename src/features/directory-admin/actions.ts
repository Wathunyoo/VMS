"use server";

import { revalidatePath } from "next/cache";
import {
  createSite,
  DirectoryError,
  importDirectory,
  saveBay,
  savePerson,
  saveUnit,
  setBayActive,
  setPersonActive,
  setUnitActive,
  updateSite,
} from "@/application/directory/directory-admin.usecase";
import { directoryAdminDeps } from "@/container";
import { requireAdmin } from "@/infrastructure/auth/session";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    revalidatePath("/admin/directory");
    revalidatePath("/check-in");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof DirectoryError) return { ok: false, error: e.message };
    console.error("[directory-admin]", e);
    return { ok: false, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" };
  }
}

const str = (v: unknown) => (v == null ? "" : String(v));

async function ctx() {
  const admin = await requireAdmin();
  return { admin, deps: directoryAdminDeps(admin.organizationId) };
}

const hoursOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));

export async function createSiteAction(s: { name: string; mode: string; maxStayHours: number | null; inductionVersion?: string }) {
  const { admin, deps } = await ctx();
  return run(() => createSite(admin, { name: str(s?.name), mode: str(s?.mode), maxStayHours: hoursOrNull(s?.maxStayHours), inductionVersion: str(s?.inductionVersion) }, deps));
}

export async function updateSiteAction(id: string, s: { name: string; maxStayHours: number | null; inductionVersion?: string }) {
  const { admin, deps } = await ctx();
  return run(() => updateSite(admin, str(id), { name: str(s?.name), mode: "", maxStayHours: hoursOrNull(s?.maxStayHours), inductionVersion: str(s?.inductionVersion) }, deps));
}

export async function saveUnitAction(siteId: string, id: string | null, u: { name: string; floor: string; unit?: string; phone?: string }) {
  const { admin, deps } = await ctx();
  return run(() => saveUnit(admin, str(siteId), id ? str(id) : null, { name: str(u?.name), floor: str(u?.floor), unit: str(u?.unit), phone: str(u?.phone) }, deps));
}

export async function setUnitActiveAction(id: string, isActive: boolean) {
  const { admin, deps } = await ctx();
  return run(() => setUnitActive(admin, str(id), Boolean(isActive), deps));
}

export async function savePersonAction(
  siteId: string,
  id: string | null,
  p: { fullName: string; department?: string; tenantId?: string; phone?: string; email?: string },
) {
  const { admin, deps } = await ctx();
  return run(() =>
    savePerson(
      admin,
      str(siteId),
      id ? str(id) : null,
      { fullName: str(p?.fullName), department: str(p?.department), tenantId: str(p?.tenantId), phone: str(p?.phone), email: str(p?.email) },
      deps,
    ),
  );
}

export async function setPersonActiveAction(id: string, isActive: boolean) {
  const { admin, deps } = await ctx();
  return run(() => setPersonActive(admin, str(id), Boolean(isActive), deps));
}

export async function saveBayAction(siteId: string, id: string | null, b: { code: string; name: string; zone?: string }) {
  const { admin, deps } = await ctx();
  return run(() => saveBay(admin, str(siteId), id ? str(id) : null, { code: str(b?.code), name: str(b?.name), zone: str(b?.zone) }, deps));
}

export async function setBayActiveAction(id: string, isActive: boolean) {
  const { admin, deps } = await ctx();
  return run(() => setBayActive(admin, str(id), Boolean(isActive), deps));
}

export async function importDirectoryAction(siteId: string, text: { tenants: string; hosts: string; bays: string }) {
  const { admin, deps } = await ctx();
  return run(() => importDirectory(admin, str(siteId), { tenants: str(text?.tenants), hosts: str(text?.hosts), bays: str(text?.bays) }, deps));
}
