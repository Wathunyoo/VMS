import {
  BUILTIN_FIELD_KEYS,
  BUILTIN_FIELDS,
  CUSTOM_FIELD_TYPES,
  type FieldConfig,
  type FieldState,
} from "@/domain/form/form-config";
import { PURPOSES_BY_MODE } from "@/domain/visit/labels";
import { SITE_MODES, VISIT_PURPOSES, type VisitPurpose } from "@/domain/visit/types";
import type { CurrentStaff } from "../auth/auth.types";
import type { CustomFieldInput, FormSettingsRepository } from "./form-settings.types";

export class SettingsError extends Error {}

export interface FormSettingsDeps {
  repo: FormSettingsRepository;
}

function requireAdmin(actor: CurrentStaff) {
  if (actor.role !== "ADMIN") throw new SettingsError("เฉพาะผู้ดูแลระบบ");
}

const MAX_CUSTOM_FIELDS = 30;

export async function getFormSettings(actor: CurrentStaff, deps: FormSettingsDeps) {
  requireAdmin(actor);
  const [config, customFields] = await Promise.all([deps.repo.config(), deps.repo.customFields(true)]);
  return { config, customFields };
}

export async function saveFieldConfig(
  actor: CurrentStaff,
  input: { fields: Record<string, string>; disabledPurposes: string[] },
  deps: FormSettingsDeps,
) {
  requireAdmin(actor);
  const fields = {} as FieldConfig;
  for (const k of BUILTIN_FIELD_KEYS) {
    const v = input.fields[k];
    if (!(BUILTIN_FIELDS[k].allowed as readonly string[]).includes(v)) throw new SettingsError(`ค่าของ “${BUILTIN_FIELDS[k].label}” ไม่ถูกต้อง`);
    fields[k] = v as FieldState;
  }
  const disabled = [...new Set(input.disabledPurposes)].filter((p): p is VisitPurpose => (VISIT_PURPOSES as readonly string[]).includes(p));
  // ทุกโหมดต้องเหลือวัตถุประสงค์อย่างน้อย 1 อย่าง
  for (const m of SITE_MODES) {
    if (PURPOSES_BY_MODE[m].every((p) => disabled.includes(p))) throw new SettingsError("ต้องเปิดวัตถุประสงค์อย่างน้อย 1 อย่างในแต่ละโหมด");
  }
  await deps.repo.saveConfig(fields, disabled, actor.username);
}

/** ตรวจและทำความสะอาดข้อมูลช่องกรอกเพิ่มเติม */
export function validateCustomField(raw: CustomFieldInput): CustomFieldInput {
  const label = String(raw.label ?? "").trim().replace(/\s+/g, " ");
  if (label.length < 1 || label.length > 60) throw new SettingsError("ชื่อช่องต้องยาว 1–60 ตัวอักษร");
  if (!(CUSTOM_FIELD_TYPES as readonly string[]).includes(raw.type)) throw new SettingsError("ประเภทช่องไม่ถูกต้อง");
  const options =
    raw.type === "SELECT"
      ? [...new Set((raw.options ?? []).map((o) => String(o).trim()).filter(Boolean))].map((o) => o.slice(0, 60))
      : [];
  if (raw.type === "SELECT" && (options.length < 2 || options.length > 30)) throw new SettingsError("ช่องแบบตัวเลือกต้องมี 2–30 ตัวเลือก");
  const modes = [...new Set(raw.modes ?? [])].filter((m) => (SITE_MODES as readonly string[]).includes(m));
  return { label, type: raw.type, options, required: !!raw.required, modes, showOnPass: !!raw.showOnPass };
}

export async function createCustomField(actor: CurrentStaff, raw: CustomFieldInput, deps: FormSettingsDeps) {
  requireAdmin(actor);
  const f = validateCustomField(raw);
  const existing = await deps.repo.customFields(true);
  if (existing.length >= MAX_CUSTOM_FIELDS) throw new SettingsError(`เพิ่มได้สูงสุด ${MAX_CUSTOM_FIELDS} ช่อง`);
  if (existing.some((e) => e.isActive && e.label === f.label)) throw new SettingsError("มีช่องชื่อนี้อยู่แล้ว");
  return deps.repo.createCustomField(f);
}

export async function updateCustomField(actor: CurrentStaff, id: string, raw: CustomFieldInput, deps: FormSettingsDeps) {
  requireAdmin(actor);
  const f = validateCustomField(raw);
  if (!(await deps.repo.updateCustomField(id, f))) throw new SettingsError("ไม่พบช่องนี้");
}

export async function setCustomFieldActive(actor: CurrentStaff, id: string, isActive: boolean, deps: FormSettingsDeps) {
  requireAdmin(actor);
  if (!(await deps.repo.updateCustomField(id, { isActive }))) throw new SettingsError("ไม่พบช่องนี้");
}

/** เลื่อนลำดับขึ้น/ลง */
export async function moveCustomField(actor: CurrentStaff, id: string, dir: -1 | 1, deps: FormSettingsDeps) {
  requireAdmin(actor);
  const list = (await deps.repo.customFields(true)).sort((a, b) => a.sortOrder - b.sortOrder);
  const i = list.findIndex((f) => f.id === id);
  if (i < 0) throw new SettingsError("ไม่พบช่องนี้");
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(list.map((f, idx) => (f.sortOrder === idx ? null : deps.repo.updateCustomField(f.id, { sortOrder: idx }))));
}
