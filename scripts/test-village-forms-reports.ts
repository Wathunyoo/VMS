/**
 * ทดสอบ: โหมดหมู่บ้าน · แบบฟอร์มปรับแต่งได้ · รายชื่อหลัก · รายงาน
 *   npm run test:features
 * สร้างองค์กรทดสอบ 2 แห่ง แล้วลบทิ้งเมื่อจบ
 */
import "dotenv/config";
import type { CurrentStaff } from "@/application/auth/auth.types";
import { checkInSchema, formDataToCheckInPayload } from "@/application/check-in/check-in.schema";
import { CheckInValidationError, checkInVisitor, NO_ID_MASKED, type CheckInDeps } from "@/application/check-in/check-in.usecase";
import { applyFormRules, precheckRawForm } from "@/application/check-in/form-rules";
import { checkOutVisit } from "@/application/check-out/check-out.usecase";
import { createSite, importDirectory, savePerson, saveUnit, setUnitActive } from "@/application/directory/directory-admin.usecase";
import { addDirectory, createFirstSite, finishOnboarding } from "@/application/onboarding/onboarding.usecase";
import { exportHistoryCsv, parseReportQuery, reportHistory, reportOverview } from "@/application/reports/report.usecase";
import { createCustomField, moveCustomField, saveFieldConfig, setCustomFieldActive } from "@/application/settings/form-settings.usecase";
import { checkInDeps, checkOutDeps, directoryAdminDeps, formSettingsDeps, onboardingDeps, reportDeps } from "@/container";
import { DEFAULT_FIELD_CONFIG, defaultFieldConfig, resolveFieldConfig, UNNAMED_VISITOR, validateCustomValues, type CustomFieldDef } from "@/domain/form/form-config";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { csvCell, toCsv } from "@/domain/reports/csv";
import { visitingText } from "@/domain/visit/labels";
import { prisma } from "@/infrastructure/db/prisma";
import { getCheckInDirectory } from "@/infrastructure/repositories/prisma-directory.repository";
import { prismaRetentionRepository } from "@/infrastructure/repositories/prisma-retention.repository";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => boolean | Promise<boolean>) {
  try {
    const ok = await fn();
    ok ? passed++ : failed++;
    console.log(`${ok ? "  ✓" : "  ✗ FAIL"}  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ FAIL  ${name} — ${e instanceof Error ? e.message : e}`);
  }
}
const rejects = (p: Promise<unknown>, contains?: string) =>
  p.then(
    () => false,
    (e: Error) => !contains || e.message.includes(contains),
  );
const fieldError = (p: Promise<unknown>, field: string) =>
  p.then(
    () => false,
    (e: unknown) => e instanceof CheckInValidationError && !!e.fieldErrors[field],
  );

const SLUGS = ["t-vfr-a", "t-vfr-b"];

async function cleanup() {
  const ids = (await prisma.organization.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } })).map((o) => o.id);
  if (!ids.length) return;
  const where = { organizationId: { in: ids } };
  await prisma.visitEvent.deleteMany({ where });
  await prisma.vehicleInfo.deleteMany({ where });
  await prisma.factorySafetyCheck.deleteMany({ where });
  await prisma.visit.deleteMany({ where });
  await prisma.visitor.deleteMany({ where });
  await prisma.host.deleteMany({ where });
  await prisma.tenant.deleteMany({ where });
  await prisma.loadingBay.deleteMany({ where });
  await prisma.site.deleteMany({ where });
  await prisma.customField.deleteMany({ where });
  await prisma.formSetting.deleteMany({ where });
  await prisma.dataPurgeLog.deleteMany({ where });
  await prisma.retentionSetting.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
}

const actor = (org: { id: string; slug: string; name: string }, role: "ADMIN" | "STAFF" = "ADMIN"): CurrentStaff => ({
  id: "x",
  organizationId: org.id,
  orgSlug: org.slug,
  orgName: org.name,
  orgStatus: "TRIAL",
  trialDaysLeft: 14,
  needsOnboarding: false,
  username: role === "ADMIN" ? "admin" : "guard",
  fullName: "Tester",
  role,
  mustChangePassword: false,
});

const notifications: string[] = [];
const deps = (orgId: string): CheckInDeps => ({
  ...checkInDeps(orgId),
  notifier: {
    sendStampRequest: async (h) => (notifications.push(h.fullName), { channel: "CONSOLE", ok: true }),
    sendGuestArrived: async () => ({ channel: "CONSOLE", ok: true }),
  },
});

/** จำลองการส่งฟอร์มจากหน้า Check-in */
function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ idType: "OTHER", pdpaConsent: "on", ...fields })) fd.set(k, v);
  return checkInSchema.parse(formDataToCheckInPayload(fd));
}

async function main() {
  await cleanup();

  console.log("\nคำเรียกและการตั้งค่า (domain)");
  await check("ข้อความติดต่อ: หมู่บ้าน / ออฟฟิศ / ไม่ระบุซอย", () =>
    visitingText("VILLAGE", { name: "99/12", floor: "3" }) === "บ้าน 99/12 · ซอย 3" &&
    visitingText("OFFICE", { name: "บจก. A", floor: "12", unit: "1201" }) === "บจก. A · ชั้น 12 (1201)" &&
    visitingText("VILLAGE", { name: "5", floor: "-" }) === "บ้าน 5");
  await check("ค่าตั้งแบบฟอร์มที่ไม่รู้จัก/ไม่อนุญาต → ใช้ค่าเริ่มต้น (ซ่อนเลขบัตรไม่ได้)", () => {
    const c = resolveFieldConfig({ phone: "REQUIRED", idNumber: "HIDDEN", company: "WHAT", extra: "x" });
    return c.phone === "REQUIRED" && c.idNumber === "REQUIRED" && c.company === "OPTIONAL" && !("extra" in c);
  });
  const cf = (over: Partial<CustomFieldDef>): CustomFieldDef => ({
    id: "f1", label: "ช่อง", type: "TEXT", options: [], required: false, modes: [], showOnPass: false, isActive: true, sortOrder: 0, ...over,
  });
  await check("ช่องเพิ่มเอง: บังคับ / ตัวเลข / ตัวเลือก / ติ๊ก", () => {
    const fields = [
      cf({ id: "a", label: "ผู้ติดตาม", type: "NUMBER", required: true }),
      cf({ id: "b", label: "สีรถ", type: "SELECT", options: ["ขาว", "ดำ"] }),
      cf({ id: "c", label: "รับทราบกฎ", type: "CHECKBOX", required: true }),
      cf({ id: "d", label: "เฉพาะโรงงาน", modes: ["FACTORY"], required: true }),
    ];
    const bad = validateCustomValues(fields, "VILLAGE", { a: "สอง", b: "แดง" });
    const good = validateCustomValues(fields, "VILLAGE", { a: "1,200", b: "ขาว", c: "on" });
    return (
      !!bad.errors.cf_a && !!bad.errors.cf_b && !!bad.errors.cf_c && !bad.errors.cf_d &&
      Object.keys(good.errors).length === 0 &&
      good.values.map((v) => v.value).join("|") === "1200|ขาว|ใช่"
    );
  });
  await check("CSV: BOM, escape, กันสูตร Excel", () =>
    toCsv([["a"]]).startsWith("﻿") && csvCell('x,"y"') === '"x,""y"""' && csvCell("=HYPERLINK(1)") === "'=HYPERLINK(1)" && csvCell(-5) === "-5");
  await check("ตัวกรองรายงาน: ค่าเริ่มต้น 7 วัน, สลับวันที่, จำกัด 366 วัน, ค่าผิดรูปแบบ", () => {
    const now = new Date("2026-10-08T03:00:00Z");
    const d = parseReportQuery({}, now);
    const sw = parseReportQuery({ from: "2026-10-05", to: "2026-10-01" }, now);
    const big = parseReportQuery({ from: "2020-01-01", to: "2026-10-08" }, now);
    const junk = parseReportQuery({ from: "x'; drop", purpose: "HACK", status: "?", page: "-3" }, now);
    return (
      d.fromYmd === "2026-10-02" && d.toYmd === "2026-10-08" && d.from.toISOString() === "2026-10-01T17:00:00.000Z" &&
      sw.fromYmd === "2026-10-01" && sw.toYmd === "2026-10-05" &&
      big.fromYmd === "2025-10-08" &&
      junk.purpose === null && junk.status === "ALL" && junk.page === 1 && junk.fromYmd === "2026-10-02"
    );
  });

  // ---------------- องค์กรหมู่บ้าน ----------------
  const A = await prisma.organization.create({ data: { slug: SLUGS[0], name: "หมู่บ้านทดสอบ", status: "TRIAL", trialEndsAt: new Date(Date.now() + 9e8) } });
  const B = await prisma.organization.create({ data: { slug: SLUGS[1], name: "Office B", status: "TRIAL", trialEndsAt: new Date(Date.now() + 9e8), onboardedAt: new Date() } });
  const a = actor(A);
  const b = actor(B);

  console.log("\nตั้งค่าเริ่มต้นแบบหมู่บ้าน");
  const od = onboardingDeps(A.id);
  const siteId = await createFirstSite(a, { name: "หมู่บ้านสวนสวย", mode: "VILLAGE", maxStayHours: 4 }, od);
  await check("ยังไม่มีบ้าน → เริ่มใช้งานไม่ได้", () => rejects(finishOnboarding(a, od), "บ้าน"));
  await check("ลูกบ้านอย่างเดียว ไม่มีบ้าน → ไม่ผ่าน", () => rejects(addDirectory(a, { tenants: "", hosts: "สมชาย, 99/1", bays: "" }, od), "บ้าน"));
  const added = await addDirectory(a, { tenants: "99/1, 1\n99/2\t1\n99/15 | 2", hosts: "สมชาย ใจดี, 99/1\nมาลี รักบ้าน, 99/15", bays: "LB-1" }, od);
  const house1 = await prisma.tenant.findFirstOrThrow({ where: { organizationId: A.id, name: "99/1" } });
  const somchai = await prisma.host.findFirstOrThrow({ where: { organizationId: A.id, fullName: "สมชาย ใจดี" } });
  await check("วางรายชื่อ: บ้าน 3 หลัง (ซอย), ลูกบ้าน 2 คนผูกบ้านถูก, ไม่สร้างจุดขนถ่าย", () =>
    added.tenants === 3 && added.hosts === 2 && added.bays === 0 && house1.floor === "1" && somchai.tenantId === house1.id);
  await finishOnboarding(a, od);
  await check("เริ่มใช้งานได้เมื่อมีบ้าน", async () => !!(await prisma.organization.findUniqueOrThrow({ where: { id: A.id } })).onboardedAt);

  console.log("\nCheck-in หมู่บ้าน");
  const base = { mode: "VILLAGE", siteId, fullName: "ผู้มาหา หนึ่ง", purpose: "GUEST" };
  await check("ไม่เลือกบ้าน/ลูกบ้าน → ไม่ผ่าน", () => {
    try {
      form({ ...base, idNumber: "AB1234" });
      return false;
    } catch (e) {
      return String(e).includes("บ้าน");
    }
  });
  await check("วัตถุประสงค์ของออฟฟิศ (สัมภาษณ์งาน) ใช้ในหมู่บ้านไม่ได้", () =>
    fieldError(checkInVisitor(form({ ...base, purpose: "INTERVIEW", tenantId: house1.id, idNumber: "AB1234" }), deps(A.id)), "purpose"));
  const v1 = await checkInVisitor(
    form({ ...base, tenantId: house1.id, hostId: somchai.id, requireStamp: "on", idNumber: "AB1234", hasVehicle: "on", plateNumber: "1กข 1234", vehicleType: "CAR" }),
    deps(A.id),
  );
  const visit1 = await prisma.visit.findUniqueOrThrow({ where: { id: v1.visitId }, include: { tenant: true, vehicle: true } });
  await check("บันทึกบ้าน + ลูกบ้าน + รถ, ขอยืนยันจากลูกบ้าน (E-Stamp)", () =>
    visit1.mode === "VILLAGE" && visit1.tenantId === house1.id && visit1.hostId === somchai.id && visit1.stampStatus === "PENDING" && visit1.vehicle?.plateNumber === "1กข 1234");
  await check("แจ้งลูกบ้าน", () => notifications.includes("สมชาย ใจดี"));
  const v2 = await checkInVisitor(form({ ...base, fullName: "ไรเดอร์", purpose: "FOOD_DELIVERY", hostId: somchai.id, idNumber: "AB9999" }), deps(A.id));
  await check("เลือกลูกบ้านอย่างเดียว → เติมบ้านให้อัตโนมัติ", async () => (await prisma.visit.findUniqueOrThrow({ where: { id: v2.visitId } })).tenantId === house1.id);
  await check("ใช้บ้านขององค์กรอื่นไม่ได้", async () => {
    const bSite = await prisma.site.create({ data: { organizationId: B.id, code: "HQ", name: "B HQ", mode: "OFFICE" } });
    const bTenant = await prisma.tenant.create({ data: { organizationId: B.id, siteId: bSite.id, name: "B Co", floor: "1" } });
    return rejects(checkInVisitor(form({ ...base, tenantId: bTenant.id, idNumber: "AB1234" }), deps(A.id)), "ไม่ถูกต้อง");
  });

  console.log("\nแบบฟอร์มปรับแต่งได้");
  const fd = formSettingsDeps(A.id);
  await check("เลขบัตรบังคับ (ค่าเริ่มต้น) → ไม่กรอกไม่ผ่าน", () =>
    fieldError(checkInVisitor(form({ ...base, tenantId: house1.id }), deps(A.id)), "idNumber"));
  await check("ปิดวัตถุประสงค์ทั้งหมดของโหมดหนึ่ง → ไม่ผ่าน", () =>
    rejects(saveFieldConfig(a, { fields: { ...DEFAULT_FIELD_CONFIG }, disabledPurposes: ["GUEST", "DELIVERY", "FOOD_DELIVERY", "MAINTENANCE", "CONTRACTOR_WORK", "OTHER"] }, fd), "อย่างน้อย"));
  await check("เจ้าหน้าที่ (ไม่ใช่ผู้ดูแล) แก้แบบฟอร์มไม่ได้", () =>
    rejects(saveFieldConfig(actor(A, "STAFF"), { fields: { ...DEFAULT_FIELD_CONFIG }, disabledPurposes: [] }, fd), "ผู้ดูแล"));
  await saveFieldConfig(
    a,
    { fields: { ...DEFAULT_FIELD_CONFIG, idNumber: "OPTIONAL", phone: "REQUIRED", company: "HIDDEN", host: "REQUIRED" }, disabledPurposes: ["MAINTENANCE"] },
    fd,
  );
  await check("เบอร์โทรบังคับ / ผู้รับพบบังคับ / วัตถุประสงค์ที่ปิด → แสดงที่ช่อง", async () => {
    const e = await checkInVisitor(form({ ...base, purpose: "MAINTENANCE", tenantId: house1.id }), deps(A.id)).then(
      () => null,
      (x: unknown) => (x instanceof CheckInValidationError ? x.fieldErrors : null),
    );
    return !!e?.phone && !!e?.hostId && !!e?.purpose && !e?.idNumber;
  });
  const cfRule = await createCustomField(a, { label: "จำนวนผู้ติดตาม", type: "NUMBER", options: [], required: true, modes: ["VILLAGE"], showOnPass: true }, fd);
  const cfColor = await createCustomField(a, { label: "สีรถ", type: "SELECT", options: ["ขาว", "ดำ", "ขาว", " "], required: false, modes: [], showOnPass: false }, fd);
  await check("ช่องตัวเลือกต้องมีอย่างน้อย 2 ตัวเลือก / ชื่อซ้ำไม่ได้", async () =>
    (await rejects(createCustomField(a, { label: "X", type: "SELECT", options: ["หนึ่ง"], required: false, modes: [], showOnPass: false }, fd), "2–30")) &&
    (await rejects(createCustomField(a, { label: "สีรถ", type: "TEXT", options: [], required: false, modes: [], showOnPass: false }, fd), "ชื่อนี้")));
  await check("ตัวเลือกซ้ำ/ว่าง ถูกตัดออก", async () => (await prisma.customField.findUniqueOrThrow({ where: { id: cfColor } })).options.join(",") === "ขาว,ดำ");
  const v3 = await checkInVisitor(
    form({ ...base, fullName: "ไม่มีบัตร", tenantId: house1.id, hostId: somchai.id, phone: "0812345678", company: "ควรถูกซ่อน", [`cf_${cfRule}`]: "3", [`cf_${cfColor}`]: "ดำ" }),
    deps(A.id),
  );
  const visit3 = await prisma.visit.findUniqueOrThrow({ where: { id: v3.visitId }, include: { visitor: true } });
  await check("ไม่กรอกเลขบัตร (ไม่บังคับ) → บันทึกว่า “ไม่ได้ระบุ”", () => visit3.visitor.idNumberMasked === NO_ID_MASKED && visit3.visitor.idType === "OTHER");
  await check("ช่องที่ซ่อน (บริษัท) ไม่ถูกบันทึกแม้ส่งมา", () => visit3.visitor.company === null);
  await check("บันทึกช่องเพิ่มเองพร้อมชื่อช่อง", () =>
    JSON.stringify(visit3.customValues) === JSON.stringify([{ id: cfRule, label: "จำนวนผู้ติดตาม", value: "3" }, { id: cfColor, label: "สีรถ", value: "ดำ" }]));
  await check("ช่องบังคับที่เพิ่มเอง ไม่กรอก → ไม่ผ่าน", () =>
    fieldError(checkInVisitor(form({ ...base, tenantId: house1.id, hostId: somchai.id, phone: "0812345678" }), deps(A.id)), `cf_${cfRule}`));
  await setCustomFieldActive(a, cfRule, false, fd);
  await check("ปิดช่อง → ไม่บังคับอีก", async () => !!(await checkInVisitor(form({ ...base, fullName: "หลังปิดช่อง", tenantId: house1.id, hostId: somchai.id, phone: "0812345678" }), deps(A.id))).visitId);
  await moveCustomField(a, cfColor, -1, fd);
  await check("เลื่อนลำดับช่อง", async () => (await fd.repo.customFields(true))[0].id === cfColor);
  await check("องค์กรอื่นเปิด/ปิดช่องของเราไม่ได้", () => rejects(setCustomFieldActive(b, cfColor, false, formSettingsDeps(B.id)), "ไม่พบ"));
  await check("โรงงาน: ซ่อนข้อมูลรถ แต่งานขนส่งยังบันทึกรถได้", () => {
    const r = applyFormRules(
      { ...form({ mode: "FACTORY", siteId: "s", fullName: "คนขับ", purpose: "CARGO", idNumber: "X1234", hasVehicle: "on", plateNumber: "70-1234", vehicleType: "TRUCK_6W", inductionCompleted: "on", ppeHelmet: "on", ppeSafetyShoes: "on", ppeReflectiveVest: "on" }) },
      { fields: { ...DEFAULT_FIELD_CONFIG, vehicle: "HIDDEN" }, disabledPurposes: [] },
      [],
    );
    return r.input.hasVehicle === true;
  });

  console.log("\nชื่อไม่บังคับ (หมู่บ้าน) / ภาพบัตร");
  await check("ค่าเริ่มต้นหมู่บ้าน: ชื่อและเบอร์โทรไม่บังคับ · ออฟฟิศ: ชื่อบังคับ", () =>
    defaultFieldConfig("VILLAGE").fullName === "OPTIONAL" && defaultFieldConfig("VILLAGE").phone === "OPTIONAL" &&
    defaultFieldConfig("OFFICE").fullName === "REQUIRED" && resolveFieldConfig({}, "VILLAGE").fullName === "OPTIONAL" &&
    resolveFieldConfig({ fullName: "REQUIRED" }, "VILLAGE").fullName === "REQUIRED");
  await check("ออฟฟิศไม่กรอกชื่อ → ไม่ผ่าน / หมู่บ้านไม่กรอกชื่อ → ผ่าน", () => {
    const office = applyFormRules(form({ mode: "OFFICE", siteId: "s", purpose: "MEETING", tenantId: "t", idNumber: "X1234" }), { fields: defaultFieldConfig("OFFICE"), disabledPurposes: [] }, []);
    const village = applyFormRules(form({ mode: "VILLAGE", siteId: "s", purpose: "GUEST", tenantId: "t", idNumber: "X1234" }), { fields: defaultFieldConfig("VILLAGE"), disabledPurposes: [] }, []);
    return !!office.errors.fullName && !village.errors.fullName;
  });
  // ใช้ค่าเริ่มต้นของหมู่บ้านสำหรับองค์กร A ตั้งแต่ตรงนี้
  await prisma.formSetting.deleteMany({ where: { organizationId: A.id } });
  const JPG = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 0xff, 0xd9]).toString("base64");
  const vNoName = await checkInVisitor(form({ ...base, fullName: "", tenantId: house1.id, idNumber: "NONAME01", idCardPhoto: JPG }), deps(A.id));
  const noName = await prisma.visit.findUniqueOrThrow({ where: { id: vNoName.visitId }, include: { visitor: true } });
  await check("ไม่กรอกชื่อ → บันทึกเป็น “ไม่ระบุชื่อ”", () => noName.visitor.fullName === UNNAMED_VISITOR);
  const cardFile = noName.idCardPhotoUrl ? path.join(process.cwd(), "storage", noName.idCardPhotoUrl.replace(/^\//, "")) : "";
  await check("เก็บภาพบัตรไว้ในโฟลเดอร์ idcards", () => /^\/photos\/idcards\//.test(noName.idCardPhotoUrl ?? "") && existsSync(cardFile));
  await checkInVisitor(form({ ...base, fullName: "สมศักดิ์ มีชื่อ", tenantId: house1.id, idNumber: "NONAME01" }), deps(A.id));
  await checkInVisitor(form({ ...base, fullName: "", tenantId: house1.id, idNumber: "NONAME01" }), deps(A.id));
  await check("มาครั้งหลังไม่กรอกชื่อ → ไม่ลบชื่อเดิมที่เคยกรอก", async () =>
    (await prisma.visitor.findUniqueOrThrow({ where: { id: noName.visitorId } })).fullName === "สมศักดิ์ มีชื่อ");
  await saveFieldConfig(a, { fields: { ...defaultFieldConfig("VILLAGE"), idCardPhoto: "HIDDEN" }, disabledPurposes: [] }, fd);
  await check("ตั้ง “ไม่เก็บภาพบัตร” → ไม่บันทึกภาพแม้ถูกส่งมา", async () => {
    const v = await checkInVisitor(form({ ...base, fullName: "", tenantId: house1.id, idNumber: "NONAME02", idCardPhoto: JPG }), deps(A.id));
    return (await prisma.visit.findUniqueOrThrow({ where: { id: v.visitId } })).idCardPhotoUrl === null;
  });
  await saveFieldConfig(a, { fields: { ...defaultFieldConfig("VILLAGE"), idCardPhoto: "REQUIRED" }, disabledPurposes: [] }, fd);
  await check("ตั้ง “บังคับสแกนบัตร” → ไม่มีภาพบัตรไม่ผ่าน", () =>
    fieldError(checkInVisitor(form({ ...base, fullName: "", tenantId: house1.id, idNumber: "NONAME03" }), deps(A.id)), "idCardPhoto"));
  await prisma.formSetting.deleteMany({ where: { organizationId: A.id } });
  await prisma.visit.update({ where: { id: vNoName.visitId }, data: { status: "CHECKED_OUT", checkOutAt: new Date("2026-01-01T00:00:00Z"), checkInAt: new Date("2026-01-01T00:00:00Z") } });
  await check("ลบรูปตามระยะเวลา (PDPA) → ลบภาพบัตรด้วย", async () => {
    const { runPurge } = await import("@/application/retention/retention.usecase");
    const { retentionDeps } = await import("@/container");
    await prisma.retentionSetting.upsert({ where: { organizationId: A.id }, create: { organizationId: A.id, photoDays: 30 }, update: { photoDays: 30 } });
    await runPurge("MANUAL", retentionDeps(A.id), "test");
    return (await prisma.visit.findUniqueOrThrow({ where: { id: vNoName.visitId } })).idCardPhotoUrl === null && !existsSync(cardFile);
  });
  if (cardFile) await rm(cardFile, { force: true });

  console.log("\nเวลาอยู่ได้ / ไม่จำกัดเวลา");
  await check("เวลาอยู่ได้เกิน 168 ชม. → ไม่ผ่าน", () => rejects(createSite(a, { name: "นานเกิน", mode: "VILLAGE", maxStayHours: 200 }, directoryAdminDeps(A.id)), "168"));
  const freeSite = await createSite(a, { name: "หมู่บ้าน (ไม่จำกัดเวลา)", mode: "VILLAGE", maxStayHours: null }, directoryAdminDeps(A.id));
  await check("สร้างสถานที่แบบไม่จำกัดเวลา", async () => (await prisma.site.findUniqueOrThrow({ where: { id: freeSite } })).defaultMaxStayMinutes === null);
  const freeHouse = await prisma.tenant.create({ data: { organizationId: A.id, siteId: freeSite, name: "1/1", floor: "1" } });
  const vFree = await checkInVisitor(form({ mode: "VILLAGE", siteId: freeSite, fullName: "พักค้างคืน", purpose: "GUEST", tenantId: freeHouse.id, idNumber: "STAY0001" }), deps(A.id));
  await check("Check-in ที่สถานที่ไม่จำกัดเวลา → ไม่มีเวลาที่ต้องออก", async () => (await prisma.visit.findUniqueOrThrow({ where: { id: vFree.visitId } })).expectedCheckOutAt === null);
  await check("อยู่ 3 วันแล้ว Check-out → ไม่นับว่าเกินเวลา", async () => {
    await prisma.visit.update({ where: { id: vFree.visitId }, data: { checkInAt: new Date(Date.now() - 3 * 86_400_000) } });
    const r = await checkOutVisit(vFree.visitId, {}, checkOutDeps(A.id));
    const v = await prisma.visit.findUniqueOrThrow({ where: { id: vFree.visitId } });
    return r.preview.overstayMinutes === 0 && v.overstayMinutes === 0 && (v.timeSpentMinutes ?? 0) >= 3 * 1440 - 1;
  });
  const limitedSite = (await prisma.site.findFirstOrThrow({ where: { id: siteId } }));
  await check("สถานที่จำกัดเวลา แต่เลือก “ไม่จำกัดเวลา” ตอน Check-in", async () => {
    const v = await checkInVisitor(form({ ...base, fullName: "ผู้มาหา", tenantId: house1.id, idNumber: "STAY0002", maxStayMinutes: "0" }), deps(A.id));
    return limitedSite.defaultMaxStayMinutes === 240 && (await prisma.visit.findUniqueOrThrow({ where: { id: v.visitId } })).expectedCheckOutAt === null;
  });
  await check("เลือก 2 ชม. ตอน Check-in → ออกภายใน 2 ชม.", async () => {
    const v = await checkInVisitor(form({ ...base, fullName: "ผู้มาหา", tenantId: house1.id, idNumber: "STAY0003", maxStayMinutes: "120" }), deps(A.id));
    const r = await prisma.visit.findUniqueOrThrow({ where: { id: v.visitId } });
    return r.expectedCheckOutAt!.getTime() - r.checkInAt.getTime() === 120 * 60_000;
  });
  await check("เวลาอยู่ได้เกิน 7 วัน → ไม่ผ่าน", () => {
    try {
      form({ ...base, tenantId: house1.id, idNumber: "STAY0004", maxStayMinutes: String(8 * 1440) });
      return false;
    } catch {
      return true;
    }
  });

  console.log("\nรายชื่อหลัก");
  const dd = directoryAdminDeps(A.id);
  const newHouse = await saveUnit(a, siteId, null, { name: "120/7", floor: "5", unit: "", phone: "" }, dd);
  await check("บ้านเลขที่ซ้ำ → ไม่ผ่าน", () => rejects(saveUnit(a, siteId, null, { name: "120/7", floor: "", unit: "", phone: "" }, dd), "อยู่แล้ว"));
  await check("ลูกบ้านต้องเลือกบ้าน", () => rejects(savePerson(a, siteId, null, { fullName: "ไม่มีบ้าน" }, dd), "บ้าน"));
  await savePerson(a, siteId, null, { fullName: "ลูกบ้านใหม่", tenantId: newHouse }, dd);
  await setUnitActive(a, newHouse, false, dd);
  await check("ปิดใช้งานบ้าน → ไม่แสดงในหน้า Check-in", async () => !(await getCheckInDirectory(A.id))[0].tenants.some((t) => t.id === newHouse));
  await check("องค์กรอื่นแก้/ปิดบ้านของเราไม่ได้", async () =>
    (await rejects(setUnitActive(b, house1.id, false, directoryAdminDeps(B.id)), "ไม่พบ")) &&
    (await rejects(saveUnit(b, siteId, house1.id, { name: "hack", floor: "" }, directoryAdminDeps(B.id)), "ไม่พบสถานที่")));
  const imp = await importDirectory(a, siteId, { tenants: "99/1, 1\n200/1, 9", hosts: "สมชาย ใจดี, 99/1\nใหม่ นำเข้า, 200/1", bays: "" }, dd);
  await check("นำเข้าซ้ำ → ข้ามรายการเดิม เพิ่มเฉพาะใหม่", () => imp.units === 1 && imp.people === 1 && imp.skipped === 2);

  console.log("\nรายงาน");
  // วางเวลาเข้าแบบกำหนดเอง เพื่อตรวจการจัดกลุ่มตามวัน/ชั่วโมงเวลาไทย
  const at = (iso: string) => new Date(iso);
  await prisma.visit.update({ where: { id: v1.visitId }, data: { checkInAt: at("2026-09-30T16:59:00Z"), expectedCheckOutAt: at("2026-09-30T20:59:00Z"), status: "CHECKED_OUT", checkOutAt: at("2026-09-30T18:00:00Z"), timeSpentMinutes: 61, overstayMinutes: 0 } }); // 30 ก.ย. 23:59
  await prisma.visit.update({ where: { id: v2.visitId }, data: { checkInAt: at("2026-09-30T17:00:00Z"), expectedCheckOutAt: at("2026-09-30T21:00:00Z"), status: "CHECKED_OUT", checkOutAt: at("2026-10-01T00:00:00Z"), timeSpentMinutes: 420, overstayMinutes: 180 } }); // 1 ต.ค. 00:00
  await prisma.visit.update({ where: { id: v3.visitId }, data: { checkInAt: at("2026-10-01T02:30:00Z"), expectedCheckOutAt: at("2026-10-01T06:30:00Z") } }); // 1 ต.ค. 09:30
  const rd = reportDeps(A.id);
  const q = parseReportQuery({ from: "2026-09-30", to: "2026-10-01" }, at("2026-10-08T00:00:00Z"));
  const ov = await reportOverview(a, q, rd);
  await check("แยกวันตามเวลาไทย (23:59 / 00:00)", () =>
    ov.daily.length === 2 && ov.daily[0].day === "2026-09-30" && ov.daily[0].count === 1 && ov.daily[1].count === 2);
  await check("ชั่วโมงตามเวลาไทย (23 / 0 / 9)", () =>
    ov.hourly[23].count === 1 && ov.hourly[0].count === 1 && ov.hourly[9].count === 1 && ov.hourly.length === 24);
  await check("สรุป: 3 ครั้ง, 3 คน, มีรถ 1, เกินเวลา 1, เฉลี่ย 241 นาที", () =>
    ov.summary.total === 3 && ov.summary.uniqueVisitors === 3 && ov.summary.withVehicle === 1 && ov.summary.overstay === 1 && ov.summary.avgMinutes === 241);
  await check("บ้านที่มีผู้มามากสุด = บ้าน 99/1", () => ov.topUnits[0]?.label === "บ้าน 99/1 · ซอย 1" && ov.topUnits[0].count === 3);
  await check("ค้นประวัติด้วยทะเบียนรถ / บ้านเลขที่ / เบอร์โทร / สถานะ", async () => {
    const byPlate = await reportHistory(a, { ...q, q: "1กข", status: "ALL" }, 1, rd);
    const byHouse = await reportHistory(a, { ...q, q: "99/1", status: "ALL" }, 1, rd);
    const inside = await reportHistory(a, { ...q, q: null, status: "INSIDE" }, 1, rd);
    const byPhone = await reportHistory(a, { ...q, q: "081-234", status: "ALL" }, 1, rd);
    return byPlate.total === 1 && byHouse.total === 3 && inside.total === 1 && inside.rows[0].visitorName === "ไม่มีบัตร" && byPhone.total === 1;
  });
  await check("องค์กรอื่นไม่เห็นข้อมูลของเรา", async () => {
    const o = await reportOverview(b, q, reportDeps(B.id));
    const h = await reportHistory(b, { ...q, q: "99/1", status: "ALL" }, 1, reportDeps(B.id));
    return o.summary.total === 0 && o.daily.every((d) => d.count === 0) && o.topUnits.length === 0 && h.total === 0;
  });
  await check("Export: เฉพาะผู้ดูแลระบบ", () => rejects(exportHistoryCsv(actor(A, "STAFF"), { ...q, q: null, status: "ALL" }, rd), "ผู้ดูแล"));
  const csv = await exportHistoryCsv(a, { ...q, q: null, status: "ALL" }, rd);
  await check("Export: BOM + หัวตาราง + คอลัมน์ช่องเพิ่มเอง + เลขบัตรปิดบางส่วน", () => {
    const lines = csv.csv.split("\r\n");
    return (
      csv.csv.startsWith("﻿") && csv.count === 3 && lines[0].includes("ติดต่อ (บริษัท/บ้าน)") &&
      lines[0].includes("จำนวนผู้ติดตาม") && lines[0].includes("สีรถ") &&
      csv.csv.includes("บ้าน 99/1 · ซอย 1") && !csv.csv.includes("AB1234") && csv.filename === "visits_2026-09-30_2026-10-01.csv"
    );
  });

  console.log("\n1 องค์กร = 1 โหมด");
  await check("ตั้งค่าเริ่มต้นแบบหมู่บ้าน → องค์กรเป็นโหมดหมู่บ้าน", async () => (await prisma.organization.findUniqueOrThrow({ where: { id: A.id } })).siteMode === "VILLAGE");
  await check("เพิ่มสถานที่ใหม่ (ส่งโหมดโรงงานมา) → ได้โหมดหมู่บ้านเสมอ", async () => {
    const id = await createSite(a, { name: "หมู่บ้านเฟส 2", mode: "FACTORY", maxStayHours: 4 }, directoryAdminDeps(A.id));
    return (await prisma.site.findUniqueOrThrow({ where: { id } })).mode === "VILLAGE";
  });
  const legacy = await prisma.site.create({ data: { organizationId: A.id, code: "OLD-F", name: "โรงงานเก่า", mode: "FACTORY" } });
  await check("สถานที่ต่างโหมด (ข้อมูลเก่า) ไม่แสดงในหน้า Check-in และหน้ารายชื่อ", async () =>
    !(await getCheckInDirectory(A.id)).some((x) => x.id === legacy.id) && !(await directoryAdminDeps(A.id).repo.sites()).some((x) => x.id === legacy.id));
  await check("Check-in ที่สถานที่ต่างโหมด → ไม่ผ่าน", () =>
    rejects(
      checkInVisitor(
        form({ mode: "FACTORY", siteId: legacy.id, fullName: "ข้ามโหมด", purpose: "MEETING", idNumber: "AB7777", phone: "0812345678", inductionCompleted: "on", ppeHelmet: "on", ppeSafetyShoes: "on", ppeReflectiveVest: "on" }),
        deps(A.id),
      ),
      "โหมดหมู่บ้าน",
    ));

  console.log("\nSafety & Work Permit (ตั้งค่าได้)");
  const fac = (extra: Record<string, string> = {}) =>
    form({ mode: "FACTORY", siteId: "s", fullName: "ช่าง", purpose: "CONTRACTOR_WORK", idNumber: "X1234", ...extra });
  const cfg = (over: Partial<typeof DEFAULT_FIELD_CONFIG> = {}) => ({ fields: { ...DEFAULT_FIELD_CONFIG, ...over }, disabledPurposes: [] });
  await check("ค่าเริ่มต้น: PPE 3 อย่าง + Induction บังคับ — แจ้งชื่ออุปกรณ์ที่ขาด", () => {
    const e = applyFormRules(fac({ ppeHelmet: "on" }), cfg(), []).errors;
    return !!e.ppe?.[0].includes("รองเท้าหัวเหล็ก") && !e.ppe[0].includes("หมวก") && !!e.inductionCompleted;
  });
  await check("ซ่อนหมวก + ไม่บังคับ Induction → ไม่ต้องติ๊ก และไม่บันทึกค่าที่ซ่อน", () => {
    const r = applyFormRules(fac({ ppeHelmet: "on", ppeSafetyShoes: "on", ppeReflectiveVest: "on" }), cfg({ ppeHelmet: "HIDDEN", induction: "OPTIONAL" }), []);
    return Object.keys(r.errors).length === 0 && r.input.ppeHelmet === false && r.input.ppeSafetyShoes === true;
  });
  await check("ตั้งถุงมือเป็นบังคับ → ไม่ติ๊กไม่ผ่าน", () =>
    !!applyFormRules(fac({ ppeHelmet: "on", ppeSafetyShoes: "on", ppeReflectiveVest: "on", inductionCompleted: "on" }), cfg({ ppeGloves: "REQUIRED" }), []).errors.ppe?.[0].includes("ถุงมือ"));
  await check("งานเสี่ยง + Work Permit บังคับ → ต้องกรอก / ไม่บังคับ → ไม่ต้อง", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ mode: "FACTORY", siteId: "s", fullName: "ช่าง", purpose: "CONTRACTOR_WORK", idType: "OTHER", idNumber: "X1234", pdpaConsent: "on", ppeHelmet: "on", ppeSafetyShoes: "on", ppeReflectiveVest: "on", inductionCompleted: "on" })) fd.set(k, v);
    fd.append("highRiskWorks", "HOT_WORK");
    const input = checkInSchema.parse(formDataToCheckInPayload(fd));
    return !!applyFormRules(input, cfg(), []).errors.workPermitId && !applyFormRules(input, cfg({ workPermit: "OPTIONAL" }), []).errors.workPermitId;
  });
  await check("ซ่อนงานเสี่ยง → ล้างรายการงานเสี่ยง และไม่ต้องมี Work Permit", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ mode: "FACTORY", siteId: "s", fullName: "ช่าง", purpose: "CONTRACTOR_WORK", idType: "OTHER", idNumber: "X1234", pdpaConsent: "on", ppeHelmet: "on", ppeSafetyShoes: "on", ppeReflectiveVest: "on", inductionCompleted: "on" })) fd.set(k, v);
    fd.append("highRiskWorks", "HOT_WORK");
    const r = applyFormRules(checkInSchema.parse(formDataToCheckInPayload(fd)), cfg({ highRiskWorks: "HIDDEN" }), []);
    return r.input.highRiskWorks.length === 0 && !r.errors.workPermitId;
  });
  await check("โหมดอื่นไม่บันทึกค่า Safety แม้ถูกส่งมา", () => {
    const r = applyFormRules(form({ mode: "VILLAGE", siteId: "s", fullName: "ผู้มาหา", purpose: "GUEST", tenantId: "t", idNumber: "X1234", ppeHelmet: "on", workPermitId: "WP-1" }), cfg(), []);
    return r.input.ppeHelmet === false && r.input.workPermitId === undefined;
  });
  await check("ส่งฟอร์มครั้งแรกเห็นข้อผิดพลาด Safety พร้อมช่องอื่น", () => {
    const e = precheckRawForm({ mode: "FACTORY", ppeHelmet: "on", custom: {} }, cfg(), []);
    return !!e.ppe && !!e.inductionCompleted && !!e.idNumber;
  });

  console.log("\nPDPA");
  await prisma.visit.update({ where: { id: v3.visitId }, data: { status: "CHECKED_OUT", checkOutAt: at("2026-10-01T03:00:00Z") } });
  await prismaRetentionRepository(A.id).anonymizePersonalData(at("2027-01-01T00:00:00Z"), new Date());
  await check("ลบข้อมูลตามระยะเวลา → ล้างช่องเพิ่มเองด้วย", async () => (await prisma.visit.findUniqueOrThrow({ where: { id: v3.visitId } })).customValues === null);

  console.log(`\nผล: ผ่าน ${passed} / ${passed + failed}${failed ? `  —  ไม่ผ่าน ${failed}` : ""}`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed", e));
    await prisma.$disconnect();
  });
