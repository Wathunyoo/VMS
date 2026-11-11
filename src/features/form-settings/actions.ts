"use server";

import { revalidatePath } from "next/cache";
import type { CustomFieldInput } from "@/application/settings/form-settings.types";
import {
  createCustomField,
  moveCustomField,
  saveFieldConfig,
  setCustomFieldActive,
  SettingsError,
  updateCustomField,
} from "@/application/settings/form-settings.usecase";
import { formSettingsDeps } from "@/container";
import { requireAdmin } from "@/infrastructure/auth/session";

type Result = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    revalidatePath("/admin/form");
    return { ok: true };
  } catch (e) {
    if (e instanceof SettingsError) return { ok: false, error: e.message };
    console.error("[form-settings]", e);
    return { ok: false, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" };
  }
}

export async function saveFieldConfigAction(input: { fields: Record<string, string>; disabledPurposes: string[] }): Promise<Result> {
  const admin = await requireAdmin();
  const fields = Object.fromEntries(Object.entries(input?.fields ?? {}).map(([k, v]) => [String(k), String(v)]));
  const disabled = Array.isArray(input?.disabledPurposes) ? input.disabledPurposes.map(String) : [];
  return run(() => saveFieldConfig(admin, { fields, disabledPurposes: disabled }, formSettingsDeps(admin.organizationId)));
}

const toInput = (f: CustomFieldInput): CustomFieldInput => ({
  label: String(f?.label ?? ""),
  type: String(f?.type ?? "") as CustomFieldInput["type"],
  options: Array.isArray(f?.options) ? f.options.map(String) : [],
  required: Boolean(f?.required),
  modes: Array.isArray(f?.modes) ? (f.modes.map(String) as CustomFieldInput["modes"]) : [],
  showOnPass: Boolean(f?.showOnPass),
});

export async function saveCustomFieldAction(id: string | null, f: CustomFieldInput): Promise<Result> {
  const admin = await requireAdmin();
  const deps = formSettingsDeps(admin.organizationId);
  return run(() => (id ? updateCustomField(admin, String(id), toInput(f), deps) : createCustomField(admin, toInput(f), deps)));
}

export async function setCustomFieldActiveAction(id: string, isActive: boolean): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => setCustomFieldActive(admin, String(id), Boolean(isActive), formSettingsDeps(admin.organizationId)));
}

export async function moveCustomFieldAction(id: string, dir: number): Promise<Result> {
  const admin = await requireAdmin();
  return run(() => moveCustomField(admin, String(id), dir < 0 ? -1 : 1, formSettingsDeps(admin.organizationId)));
}
