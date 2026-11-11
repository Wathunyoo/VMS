import { z } from "zod";
import { isValidThaiNationalId, normalizeIdNumber } from "@/domain/visit/id-masking";
import {
  HIGH_RISK_WORKS,
  ID_DOCUMENT_TYPES,
  SITE_MODES,
  VEHICLE_TYPES,
  VISIT_PURPOSES,
} from "@/domain/visit/types";

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().max(200).optional(),
);
const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number().nonnegative().optional(),
);
const photoDataUrl = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,/, "รูปภาพไม่ถูกต้อง")
    .max(3_000_000, "รูปภาพใหญ่เกินไป")
    .optional(),
);

export const checkInSchema = z
  .object({
    mode: z.enum(SITE_MODES),
    siteId: z.string().min(1),

    // ข้อมูลผู้ติดต่อ
    // บังคับกรอกหรือไม่ ขึ้นกับการตั้งค่าแบบฟอร์ม (form-rules.ts)
    fullName: z
      .preprocess((v) => (v == null ? "" : v), z.string().trim().max(120))
      .refine((v) => v === "" || v.length >= 2, "ชื่อสั้นเกินไป"),
    company: optionalText,
    phone: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().regex(/^[0-9+\-\s]{9,15}$/, "เบอร์โทรไม่ถูกต้อง").optional(),
    ),
    idType: z.enum(ID_DOCUMENT_TYPES),
    // บังคับกรอกหรือไม่ ขึ้นกับการตั้งค่าแบบฟอร์มขององค์กร (form-rules.ts)
    idNumber: z
      .preprocess((v) => (v == null ? "" : v), z.string())
      .transform(normalizeIdNumber)
      .pipe(z.string().max(20).refine((v) => v === "" || v.length >= 4, "เลขบัตรสั้นเกินไป")),
    pdpaConsent: checkbox.refine((v) => v, "ต้องได้รับความยินยอมตาม PDPA"),
    facePhoto: photoDataUrl,
    idCardPhoto: photoDataUrl,
    badgeNumber: optionalText,

    // การเข้าพบ
    purpose: z.enum(VISIT_PURPOSES),
    purposeNote: optionalText,
    tenantId: optionalText,
    hostId: optionalText,
    // เวลาอยู่ได้ของการเข้าพบครั้งนี้ (นาที) — ว่าง = ตามค่าตั้งของสถานที่, 0 = ไม่จำกัดเวลา
    maxStayMinutes: z.preprocess(
      (v) => (v === "" || v == null ? undefined : Number(v)),
      z.number().int().min(0).max(7 * 1440, "เวลาอยู่ได้ไม่เกิน 7 วัน").optional(),
    ),
    requireStamp: checkbox,
    // แขกที่ลูกบ้านแจ้งล่วงหน้า (สแกน QR / เลือกจากรายการ)
    inviteId: optionalText,

    // ยานพาหนะ
    hasVehicle: checkbox,
    plateNumber: optionalText,
    plateProvince: optionalText,
    vehicleType: z.preprocess((v) => (v === "" ? undefined : v), z.enum(VEHICLE_TYPES).optional()),
    platePhoto: photoDataUrl,
    driverName: optionalText,

    // โรงงาน — PPE / งานเสี่ยง / Induction / Cargo
    ppeHelmet: checkbox,
    ppeSafetyShoes: checkbox,
    ppeReflectiveVest: checkbox,
    ppeSafetyGlasses: checkbox,
    ppeEarProtection: checkbox,
    ppeGloves: checkbox,
    highRiskWorks: z.array(z.enum(HIGH_RISK_WORKS)).default([]),
    workPermitId: optionalText,
    inductionCompleted: checkbox,
    loadingBayId: optionalText,
    cargoDescription: optionalText,
    sealNumber: optionalText,
    weightInKg: optionalNumber,

    // ช่องที่องค์กรเพิ่มเอง { fieldId: value } — ตรวจใน form-rules.ts
    custom: z.record(z.string(), z.string().max(1000)).default({}),
  })
  .superRefine((d, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    if (d.idNumber && d.idType === "NATIONAL_ID" && !isValidThaiNationalId(d.idNumber)) {
      issue("idNumber", "เลขบัตรประชาชนไม่ถูกต้อง");
    }

    if (d.hasVehicle) {
      if (!d.plateNumber) issue("plateNumber", "กรุณากรอกทะเบียนรถ");
      if (!d.vehicleType) issue("vehicleType", "กรุณาเลือกประเภทรถ");
    }

    if (d.mode === "OFFICE" && !d.inviteId) {
      if (!d.tenantId && !d.hostId) issue("hostId", "กรุณาเลือกบริษัทหรือผู้ที่ต้องการพบ");
    }

    // แขกที่แจ้งล่วงหน้า: บ้าน/ลูกบ้านมาจาก QR
    if (d.mode === "VILLAGE" && !d.inviteId) {
      if (!d.tenantId && !d.hostId) issue("hostId", "กรุณาเลือกบ้านหรือลูกบ้านที่ต้องการพบ");
    }

    // PPE / Induction / Work Permit ตรวจตามการตั้งค่าแบบฟอร์ม (form-rules.ts)
    if (d.mode === "FACTORY") {
      if (d.purpose === "CARGO" && !d.hasVehicle) {
        issue("hasVehicle", "งานขนส่งต้องบันทึกข้อมูลรถ");
      }
    }
  });

export type CheckInInput = z.infer<typeof checkInSchema>;

/** แปลง FormData → object ก่อน validate (รองรับ field หลายค่า) */
export function formDataToCheckInPayload(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  const custom: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    if (k.startsWith("cf_")) custom[k.slice(3)] = v;
    else obj[k] = v;
  }
  obj.highRiskWorks = fd.getAll("highRiskWorks");
  obj.custom = custom;
  return obj;
}
