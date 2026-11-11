import type { SiteMode, VisitPurpose } from "../visit/types";

/** กลุ่มของช่อง — "factory" แสดงเฉพาะองค์กรโหมดโรงงาน */
export type FieldGroup = "general" | "factory";

/**
 * การตั้งค่าแบบฟอร์ม Check-in ขององค์กร
 *  - ช่องมาตรฐาน: ซ่อน / ไม่บังคับ / บังคับกรอก
 *  - ช่องที่องค์กรเพิ่มเอง (CustomField)
 * ใช้ได้ทั้ง server และ client
 */
export const FIELD_STATES = ["HIDDEN", "OPTIONAL", "REQUIRED"] as const;
export type FieldState = (typeof FIELD_STATES)[number];

export const FIELD_STATE_LABEL: Record<FieldState, string> = {
  HIDDEN: "ซ่อน",
  OPTIONAL: "ไม่บังคับ",
  REQUIRED: "บังคับกรอก",
};

interface BuiltinField {
  label: string;
  hint?: string;
  group?: FieldGroup;
  default: FieldState;
  /** สถานะที่เลือกได้ */
  allowed: readonly FieldState[];
}

export const BUILTIN_FIELDS = {
  fullName: { label: "ชื่อ-นามสกุล", hint: "ไม่บังคับ = บันทึกเป็น “ไม่ระบุชื่อ” ถ้าไม่กรอก", default: "REQUIRED", allowed: ["OPTIONAL", "REQUIRED"] },
  idNumber: {
    label: "เลขบัตรประชาชน / เอกสาร",
    hint: "ใช้ตรวจรายชื่อห้ามเข้า — ถ้าไม่บังคับ ผู้ที่ไม่กรอกจะตรวจรายชื่อห้ามเข้าไม่ได้",
    default: "REQUIRED",
    allowed: ["OPTIONAL", "REQUIRED"],
  },
  idCardPhoto: {
    label: "เก็บภาพบัตร (จากการสแกน)",
    hint: "ซ่อน = อ่านข้อมูลแล้วไม่เก็บภาพ · บังคับ = ต้องสแกนบัตรทุกครั้ง · ภาพบัตรลบอัตโนมัติพร้อมรูปถ่ายตามนโยบาย PDPA",
    default: "OPTIONAL",
    allowed: FIELD_STATES,
  },
  company: { label: "บริษัท / หน่วยงาน", default: "OPTIONAL", allowed: FIELD_STATES },
  phone: { label: "เบอร์โทรศัพท์", default: "OPTIONAL", allowed: FIELD_STATES },
  facePhoto: { label: "ภาพถ่ายผู้ติดต่อ", default: "OPTIONAL", allowed: FIELD_STATES },
  badgeNumber: { label: "เลขบัตรแลก", default: "OPTIONAL", allowed: FIELD_STATES },
  purposeNote: { label: "รายละเอียดเพิ่มเติม", default: "OPTIONAL", allowed: FIELD_STATES },
  host: {
    label: "ผู้ที่ต้องการพบ / ลูกบ้าน",
    hint: "อาคารสำนักงาน/หมู่บ้าน: ต้องเลือกบริษัทหรือบ้านเสมอ — ตั้ง “บังคับ” ให้ต้องระบุตัวบุคคลด้วย",
    default: "OPTIONAL",
    allowed: ["OPTIONAL", "REQUIRED"],
  },
  vehicle: { label: "ข้อมูลรถ", hint: "บังคับ = ทุกคนต้องบันทึกทะเบียนรถ", default: "OPTIONAL", allowed: FIELD_STATES },
  platePhoto: { label: "ภาพป้ายทะเบียน", default: "OPTIONAL", allowed: FIELD_STATES },

  // ---- Safety & Work Permit (โรงงาน) ----
  ppeHelmet: { label: "PPE: หมวกเซฟตี้", hint: "บังคับ = ต้องติ๊กว่าสวมแล้วจึงเข้าพื้นที่ได้", group: "factory", default: "REQUIRED", allowed: FIELD_STATES },
  ppeSafetyShoes: { label: "PPE: รองเท้าหัวเหล็ก", group: "factory", default: "REQUIRED", allowed: FIELD_STATES },
  ppeReflectiveVest: { label: "PPE: เสื้อสะท้อนแสง", group: "factory", default: "REQUIRED", allowed: FIELD_STATES },
  ppeSafetyGlasses: { label: "PPE: แว่นตานิรภัย", group: "factory", default: "OPTIONAL", allowed: FIELD_STATES },
  ppeEarProtection: { label: "PPE: ที่อุดหู/ครอบหู", group: "factory", default: "OPTIONAL", allowed: FIELD_STATES },
  ppeGloves: { label: "PPE: ถุงมือ", group: "factory", default: "OPTIONAL", allowed: FIELD_STATES },
  highRiskWorks: { label: "ประเภทงานเสี่ยง", hint: "Hot Work, ที่อับอากาศ, ที่สูง, ไฟฟ้า, สารเคมี, งานยก", group: "factory", default: "OPTIONAL", allowed: ["HIDDEN", "OPTIONAL"] },
  workPermit: { label: "เลขที่ Work Permit", hint: "บังคับ = ต้องกรอกเมื่อเลือกงานเสี่ยง", group: "factory", default: "REQUIRED", allowed: FIELD_STATES },
  induction: { label: "Safety Induction", hint: "บังคับ = ต้องติ๊กว่าผ่านการอบรมแล้วจึงเข้าพื้นที่ได้", group: "factory", default: "REQUIRED", allowed: FIELD_STATES },
} as const satisfies Record<string, BuiltinField>;

export const fieldGroup = (k: BuiltinFieldKey): FieldGroup => ("group" in BUILTIN_FIELDS[k] ? (BUILTIN_FIELDS[k] as BuiltinField).group! : "general");

/** ช่องที่ใช้กับโหมดนี้ */
export const fieldsForMode = (mode: SiteMode) => BUILTIN_FIELD_KEYS.filter((k) => fieldGroup(k) === "general" || mode === "FACTORY");

export type BuiltinFieldKey = keyof typeof BUILTIN_FIELDS;
export const BUILTIN_FIELD_KEYS = Object.keys(BUILTIN_FIELDS) as BuiltinFieldKey[];
export type FieldConfig = Record<BuiltinFieldKey, FieldState>;

export interface FormConfig {
  fields: FieldConfig;
  disabledPurposes: VisitPurpose[];
}

export const DEFAULT_FIELD_CONFIG: FieldConfig = Object.fromEntries(
  BUILTIN_FIELD_KEYS.map((k) => [k, BUILTIN_FIELDS[k].default]),
) as FieldConfig;

/** ค่าเริ่มต้นที่ต่างกันตามโหมด — หมู่บ้าน: ชื่อและเบอร์โทรไม่บังคับ */
const MODE_DEFAULTS: Partial<Record<SiteMode, Partial<FieldConfig>>> = {
  VILLAGE: { fullName: "OPTIONAL", phone: "OPTIONAL" },
};

export const defaultFieldConfig = (mode?: SiteMode | null): FieldConfig => ({ ...DEFAULT_FIELD_CONFIG, ...(mode ? MODE_DEFAULTS[mode] : {}) });

/** ชื่อที่บันทึกเมื่อไม่ได้กรอก (แบบฟอร์มตั้งเป็นไม่บังคับ) */
export const UNNAMED_VISITOR = "ไม่ระบุชื่อ";

/** อ่านค่าจาก DB แบบปลอดภัย — ค่าที่ไม่รู้จัก/ไม่อนุญาต ใช้ค่าเริ่มต้น (ตามโหมดขององค์กร) */
export function resolveFieldConfig(raw: unknown, mode?: SiteMode | null): FieldConfig {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = defaultFieldConfig(mode);
  for (const k of BUILTIN_FIELD_KEYS) {
    const v = src[k];
    if (typeof v === "string" && (BUILTIN_FIELDS[k].allowed as readonly string[]).includes(v)) out[k] = v as FieldState;
  }
  return out;
}

// ---------------- Custom fields ----------------

export const CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "SELECT", "CHECKBOX"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  TEXT: "ข้อความ",
  NUMBER: "ตัวเลข",
  SELECT: "ตัวเลือก",
  CHECKBOX: "ช่องติ๊ก (ใช่/ไม่ใช่)",
};

export interface CustomFieldDef {
  id: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  /** ว่าง = ทุกโหมด */
  modes: SiteMode[];
  showOnPass: boolean;
  isActive: boolean;
  sortOrder: number;
}

/** ค่าที่บันทึกกับการเข้าพบ — เก็บชื่อช่องไว้ด้วย แก้ชื่อ/ลบช่องภายหลังประวัติยังอ่านได้ */
export interface CustomValue {
  id: string;
  label: string;
  value: string;
}

export const customFieldName = (id: string) => `cf_${id}`;

export const appliesToMode = (f: Pick<CustomFieldDef, "modes" | "isActive">, mode: SiteMode) =>
  f.isActive && (f.modes.length === 0 || f.modes.includes(mode));

const MAX_VALUE = 300;

/**
 * ตรวจค่าที่กรอกในช่องที่องค์กรเพิ่มเอง
 * raw = { [fieldId]: string } จากฟอร์ม
 */
export function validateCustomValues(
  fields: CustomFieldDef[],
  mode: SiteMode,
  raw: Record<string, string | undefined>,
): { values: CustomValue[]; errors: Record<string, string> } {
  const values: CustomValue[] = [];
  const errors: Record<string, string> = {};
  for (const f of fields.filter((x) => appliesToMode(x, mode)).sort((a, b) => a.sortOrder - b.sortOrder)) {
    const key = customFieldName(f.id);
    const v = (raw[f.id] ?? "").trim();
    if (f.type === "CHECKBOX") {
      const on = v === "on" || v === "true";
      if (f.required && !on) errors[key] = `กรุณาติ๊ก “${f.label}”`;
      values.push({ id: f.id, label: f.label, value: on ? "ใช่" : "ไม่" });
      continue;
    }
    if (!v) {
      if (f.required) errors[key] = `กรุณากรอก “${f.label}”`;
      continue;
    }
    if (v.length > MAX_VALUE) {
      errors[key] = "ข้อความยาวเกินไป";
      continue;
    }
    if (f.type === "NUMBER" && !/^-?\d+(\.\d+)?$/.test(v.replace(/,/g, ""))) {
      errors[key] = `“${f.label}” ต้องเป็นตัวเลข`;
      continue;
    }
    if (f.type === "SELECT" && !f.options.includes(v)) {
      errors[key] = `กรุณาเลือก “${f.label}” จากรายการ`;
      continue;
    }
    values.push({ id: f.id, label: f.label, value: f.type === "NUMBER" ? v.replace(/,/g, "") : v });
  }
  return { values, errors };
}
