import {
  type CustomFieldDef,
  type CustomValue,
  type FieldConfig,
  type FormConfig,
  validateCustomValues,
} from "@/domain/form/form-config";
import { PPE_LABEL, PURPOSES_BY_MODE } from "@/domain/visit/labels";
import { PPE_ITEMS, type PpeItem } from "@/domain/visit/types";
import { SITE_MODES, type SiteMode } from "@/domain/visit/types";
import type { CheckInInput } from "./check-in.schema";

/**
 * ใช้การตั้งค่าแบบฟอร์มขององค์กรกับข้อมูล Check-in
 *  - ช่องที่ "ซ่อน" → ทิ้งค่าที่ส่งมา
 *  - ช่องที่ "บังคับกรอก" → ต้องมีค่า
 *  - ตรวจช่องที่องค์กรเพิ่มเอง และวัตถุประสงค์ที่ปิดไว้
 */
export function applyFormRules(
  input: CheckInInput,
  config: FormConfig,
  customFields: CustomFieldDef[],
): { input: CheckInInput; customValues: CustomValue[]; errors: Record<string, string[]> } {
  const f = config.fields;
  const d: CheckInInput = { ...input };
  const errors: Record<string, string[]> = {};
  const add = (k: string, m: string) => (errors[k] ??= []).push(m);

  const text = (key: "company" | "phone" | "badgeNumber" | "purposeNote", label: string) => {
    if (f[key] === "HIDDEN") d[key] = undefined;
    else if (f[key] === "REQUIRED" && !d[key]) add(key, `กรุณากรอก${label}`);
  };
  text("company", "บริษัท / หน่วยงาน");
  text("phone", "เบอร์โทรศัพท์");
  text("badgeNumber", "เลขบัตรแลก");
  text("purposeNote", "รายละเอียด");

  if (f.fullName === "REQUIRED" && !d.fullName) add("fullName", "กรุณากรอกชื่อ-นามสกุล");
  if (f.idNumber === "REQUIRED" && !d.idNumber) add("idNumber", "กรุณากรอกเลขบัตร");
  if (f.idCardPhoto === "HIDDEN") d.idCardPhoto = undefined;
  else if (f.idCardPhoto === "REQUIRED" && !d.idCardPhoto) add("idCardPhoto", "กรุณาสแกนบัตร");

  if (f.facePhoto === "HIDDEN") d.facePhoto = undefined;
  else if (f.facePhoto === "REQUIRED" && !d.facePhoto) add("facePhoto", "กรุณาถ่ายภาพผู้ติดต่อ");

  if (f.host === "REQUIRED" && d.mode !== "FACTORY" && !d.hostId) {
    add("hostId", d.mode === "VILLAGE" ? "กรุณาเลือกลูกบ้านที่ต้องการพบ" : "กรุณาเลือกผู้ที่ต้องการพบ");
  }

  if (f.vehicle === "HIDDEN" && !(d.mode === "FACTORY" && d.purpose === "CARGO")) d.hasVehicle = false;
  else if (f.vehicle === "REQUIRED" && !d.hasVehicle) add("hasVehicle", "กรุณาบันทึกข้อมูลรถ");

  if (!d.hasVehicle || f.platePhoto === "HIDDEN") d.platePhoto = undefined;
  else if (f.platePhoto === "REQUIRED" && !d.platePhoto) add("platePhoto", "กรุณาถ่ายภาพป้ายทะเบียน");

  if (!PURPOSES_BY_MODE[d.mode].includes(d.purpose) || config.disabledPurposes.includes(d.purpose)) {
    add("purpose", "วัตถุประสงค์นี้ไม่เปิดใช้");
  }

  if (d.mode === "FACTORY") {
    // ช่องที่ซ่อน → ไม่บันทึก
    for (const k of PPE_ITEMS) if (f[k] === "HIDDEN") d[k] = false;
    if (f.induction === "HIDDEN") d.inductionCompleted = false;
    if (f.highRiskWorks === "HIDDEN") d.highRiskWorks = [];
    if (f.workPermit === "HIDDEN") d.workPermitId = undefined;
    for (const [k, m] of Object.entries(
      factoryErrors(f, {
        ppe: (k) => d[k],
        induction: d.inductionCompleted,
        risks: d.highRiskWorks.length,
        permit: !!d.workPermitId,
      }),
    ))
      add(k, m);
  } else {
    for (const k of PPE_ITEMS) d[k] = false;
    d.inductionCompleted = false;
    d.highRiskWorks = [];
    d.workPermitId = undefined;
  }

  const custom = validateCustomValues(customFields, d.mode, d.custom);
  for (const [k, m] of Object.entries(custom.errors)) add(k, m);

  return { input: d, customValues: custom.values, errors };
}

/** Safety & Work Permit ของโรงงาน ตามการตั้งค่า */
function factoryErrors(
  f: FieldConfig,
  v: { ppe: (k: PpeItem) => boolean; induction: boolean; risks: number; permit: boolean },
): Record<string, string> {
  const errors: Record<string, string> = {};
  const missing = PPE_ITEMS.filter((k) => f[k] === "REQUIRED" && !v.ppe(k));
  if (missing.length) errors.ppe = `ต้องสวม PPE: ${missing.map((k) => PPE_LABEL[k]).join(", ")}`;
  if (f.induction === "REQUIRED" && !v.induction) errors.inductionCompleted = "ผู้ติดต่อต้องผ่าน Safety Induction ก่อนเข้าพื้นที่";
  if (f.highRiskWorks !== "HIDDEN" && f.workPermit === "REQUIRED" && v.risks > 0 && !v.permit) {
    errors.workPermitId = "งานเสี่ยงต้องแนบเลขที่ Work Permit";
  }
  return errors;
}

/**
 * ตรวจช่องบังคับตามการตั้งค่าจากข้อมูลดิบ — ใช้เมื่อข้อมูลพื้นฐานยังไม่ผ่าน
 * เพื่อแสดงข้อผิดพลาดทุกช่องในครั้งเดียว (ไม่ต้องส่งฟอร์มหลายรอบ)
 */
export function precheckRawForm(
  payload: Record<string, unknown>,
  config: FormConfig,
  customFields: CustomFieldDef[],
): Record<string, string[]> {
  const mode = (SITE_MODES as readonly string[]).includes(String(payload.mode)) ? (payload.mode as SiteMode) : null;
  if (!mode) return {};
  const f = config.fields;
  const has = (k: string) => typeof payload[k] === "string" && (payload[k] as string).trim() !== "";
  const errors: Record<string, string[]> = {};
  const add = (k: string, m: string) => (errors[k] ??= []).push(m);
  const labels = { company: "บริษัท / หน่วยงาน", phone: "เบอร์โทรศัพท์", badgeNumber: "เลขบัตรแลก", purposeNote: "รายละเอียด" } as const;
  for (const k of Object.keys(labels) as (keyof typeof labels)[]) if (f[k] === "REQUIRED" && !has(k)) add(k, `กรุณากรอก${labels[k]}`);
  if (f.fullName === "REQUIRED" && !has("fullName")) add("fullName", "กรุณากรอกชื่อ-นามสกุล");
  if (f.idNumber === "REQUIRED" && !has("idNumber")) add("idNumber", "กรุณากรอกเลขบัตร");
  if (f.idCardPhoto === "REQUIRED" && !has("idCardPhoto")) add("idCardPhoto", "กรุณาสแกนบัตร");
  if (f.facePhoto === "REQUIRED" && !has("facePhoto")) add("facePhoto", "กรุณาถ่ายภาพผู้ติดต่อ");
  if (f.host === "REQUIRED" && mode !== "FACTORY" && !has("hostId")) add("hostId", mode === "VILLAGE" ? "กรุณาเลือกลูกบ้านที่ต้องการพบ" : "กรุณาเลือกผู้ที่ต้องการพบ");
  if (f.vehicle === "REQUIRED" && payload.hasVehicle !== "on") add("hasVehicle", "กรุณาบันทึกข้อมูลรถ");
  if (mode === "FACTORY") {
    const risks = Array.isArray(payload.highRiskWorks) ? payload.highRiskWorks.length : 0;
    for (const [k, m] of Object.entries(
      factoryErrors(f, { ppe: (k) => payload[k] === "on", induction: payload.inductionCompleted === "on", risks, permit: has("workPermitId") }),
    ))
      add(k, m);
  }
  const custom = (payload.custom ?? {}) as Record<string, string>;
  for (const [k, m] of Object.entries(validateCustomValues(customFields, mode, custom).errors)) add(k, m);
  return errors;
}
