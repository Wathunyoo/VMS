/**
 * ทดสอบระบบเก็บเงิน (โอน + แนบสลิป) และจุด Check-in
 *   npm run test:billing
 * สร้างองค์กรทดสอบ แล้วลบทิ้งเมื่อจบ (รวมไฟล์สลิป) และคืนตัวนับเลขที่เอกสารเป็นค่าเดิม
 * ⚠️ อย่ารันบนระบบที่มีลูกค้าออกใบแจ้งหนี้อยู่พร้อมกัน (เลขที่เอกสารจริงอาจข้าม)
 */
import "dotenv/config";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { CurrentStaff } from "@/application/auth/auth.types";
import type { BillingMailer } from "@/application/billing/billing.types";
import {
  approveInvoice,
  billingOverview,
  cancelInvoice,
  createInvoice,
  rejectInvoice,
  saveBillingProfile,
  uploadSlip,
  validateProfile,
  type BillingDeps,
  type PlatformDeps,
} from "@/application/billing/billing.usecase";
import { checkStation, registerDevice, revokeDevice } from "@/application/billing/devices.usecase";
import { billingDeps, deviceDeps, platformDeps } from "@/container";
import { computeAccess, extendCoverage } from "@/domain/billing/access";
import { crc16, promptPayPayload } from "@/domain/billing/promptpay";
import { quote } from "@/domain/billing/pricing";
import { prisma } from "@/infrastructure/db/prisma";

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

const DAY = 86_400_000;
const SLUGS = ["t-bill-a", "t-bill-b"];
const outbox: { to: string; subject: string }[] = [];
const fakeMailer: BillingMailer = { send: async (to, subject) => void outbox.push({ to, subject }) };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const slipFiles: string[] = [];
let counterSnapshot: { key: string; value: number }[] | null = null;

async function cleanup() {
  if (counterSnapshot) {
    // คืนเลขที่เอกสาร — เอกสารภาษีจริงต้องเรียงต่อเนื่องไม่ขาดหาย
    const keep = new Map(counterSnapshot.map((c) => [c.key, c.value]));
    for (const c of await prisma.documentCounter.findMany()) {
      if (!keep.has(c.key)) await prisma.documentCounter.delete({ where: { key: c.key } });
      else if (keep.get(c.key) !== c.value) await prisma.documentCounter.update({ where: { key: c.key }, data: { value: keep.get(c.key)! } });
    }
  }
  const orgs = await prisma.organization.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (!ids.length) return;
  const where = { organizationId: { in: ids } };
  for (const i of await prisma.invoice.findMany({ where, select: { slipPath: true } })) if (i.slipPath) slipFiles.push(i.slipPath);
  await prisma.invoice.deleteMany({ where });
  await prisma.checkInPoint.deleteMany({ where });
  await prisma.billingProfile.deleteMany({ where });
  await prisma.staffUser.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  for (const f of slipFiles) await rm(path.join(process.cwd(), "storage", "slips", f), { force: true });
}

function actor(org: { id: string; slug: string; name: string }): CurrentStaff {
  return {
    id: "x",
    organizationId: org.id,
    orgSlug: org.slug,
    orgName: org.name,
    orgStatus: "TRIAL",
    trialDaysLeft: 14,
    needsOnboarding: false,
    username: "admin",
    fullName: "Admin",
    role: "ADMIN",
    mustChangePassword: false,
  };
}

async function main() {
  await cleanup();
  counterSnapshot = await prisma.documentCounter.findMany();

  console.log("\nคำนวณราคา / VAT / หัก ณ ที่จ่าย");
  await check("2 จุด รายเดือน = 980 + VAT 68.60 = 1,048.60", () => {
    const q = quote(2, "MONTHLY", false);
    return q.subtotal === 980 && q.vat === 68.6 && q.netPayable === 1048.6 && q.months === 1;
  });
  await check("3 จุด รายปี (จ่าย 10 เดือน ใช้ 12) หัก 3% = 15,288", () => {
    const q = quote(3, "YEARLY", true);
    return q.subtotal === 14700 && q.vat === 1029 && q.withholding === 441 && q.netPayable === 15288 && q.months === 12;
  });
  await check("จำนวนจุด 0 หรือเกิน 50 → ไม่ผ่าน", () => {
    try {
      quote(0, "MONTHLY", false);
      return false;
    } catch {
      try {
        quote(51, "MONTHLY", false);
        return false;
      } catch {
        return true;
      }
    }
  });
  await check("PromptPay: CRC มาตรฐาน + มียอดเงินใน QR", () =>
    crc16("123456789") === "29B1" && promptPayPayload("0812345678", 1048.6).includes("54071048.60"));

  console.log("\nสถานะสิทธิ์ใช้งาน");
  const now = new Date("2026-10-06T03:00:00Z");
  const base = { checkInPointLimit: 5, paidUntil: null as Date | null, trialEndsAt: null as Date | null, status: "TRIAL" };
  await check("ทดลองใช้: Check-in ได้ และใช้จำนวนจุดตามสัญญา", () => {
    const a = computeAccess({ ...base, trialEndsAt: new Date(now.getTime() + 3 * DAY) }, now);
    return a.state === "TRIAL" && a.canCheckIn && a.pointLimit === 5 && a.daysLeft === 3;
  });
  await check("หมดช่วงทดลอง → Check-in ไม่ได้", () => {
    const a = computeAccess({ ...base, trialEndsAt: new Date(now.getTime() - DAY) }, now);
    return a.state === "TRIAL_ENDED" && !a.canCheckIn;
  });
  await check("ชำระแล้ว → ใช้ได้ตามจำนวนจุดที่ซื้อ", () => {
    const a = computeAccess({ ...base, status: "ACTIVE", paidUntil: new Date(now.getTime() + 20 * DAY) }, now);
    return a.state === "ACTIVE" && a.canCheckIn && a.pointLimit === 5;
  });
  await check("เลยกำหนด 3 วัน → ผ่อนผัน (Check-in ได้ + เตือน)", () => {
    const a = computeAccess({ ...base, status: "ACTIVE", paidUntil: new Date(now.getTime() - 3 * DAY) }, now);
    return a.state === "GRACE" && a.canCheckIn && !!a.message;
  });
  await check("เลยกำหนด 8 วัน → หมดอายุ (Check-in ไม่ได้)", () => {
    const a = computeAccess({ ...base, status: "ACTIVE", paidUntil: new Date(now.getTime() - 8 * DAY) }, now);
    return a.state === "EXPIRED" && !a.canCheckIn;
  });
  await check("ACTIVE ไม่มีวันหมดอายุ = สัญญาพิเศษ", () => computeAccess({ ...base, status: "ACTIVE" }, now).state === "UNLIMITED");
  await check("ต่ออายุก่อนหมด → ต่อจากวันหมดเดิม (ไม่เสียวัน)", () => {
    const cur = new Date(now.getTime() + 10 * DAY);
    return extendCoverage(cur, now, 1).from.getTime() === cur.getTime();
  });
  await check("ต่ออายุหลังหมด → เริ่มนับวันนี้", () => extendCoverage(new Date(now.getTime() - 30 * DAY), now, 1).from.getTime() === now.getTime());
  await check("เลขผู้เสียภาษีผิด checksum → ไม่ผ่าน", () => {
    try {
      validateProfile({ legalName: "บจก. ทดสอบ", taxId: "1234567890123", branch: "", address: "123 ถนนทดสอบ กรุงเทพ", billingEmail: "a@b.co" });
      return false;
    } catch {
      return true;
    }
  });

  // --- องค์กรทดสอบ ---
  const trialEnds = new Date(Date.now() + 10 * DAY);
  const A = await prisma.organization.create({ data: { slug: SLUGS[0], name: "Bill A", status: "TRIAL", trialEndsAt: trialEnds, onboardedAt: new Date() } });
  const B = await prisma.organization.create({ data: { slug: SLUGS[1], name: "Bill B", status: "TRIAL", trialEndsAt: trialEnds, onboardedAt: new Date() } });
  // ตรวจสลิปแบบไม่เชื่อมธนาคาร (การตรวจอัตโนมัติทดสอบใน test:slip)
  const manual = { slipCheck: { ...billingDeps(A.id).slipCheck, provider: null }, autoApprove: null };
  const depsA: BillingDeps = { ...billingDeps(A.id), ...manual, mailer: fakeMailer, platformEmail: "ops@vms.test" };
  const depsB: BillingDeps = { ...billingDeps(B.id), ...manual, mailer: fakeMailer, platformEmail: "ops@vms.test" };
  const plat: PlatformDeps = { ...platformDeps(), mailer: fakeMailer };
  const a = actor(A);

  console.log("\nจุด Check-in");
  const devA = deviceDeps(A.id);
  const t1 = await registerDevice(a, "ประตู 1", devA);
  const t2 = await registerDevice(a, "ประตู 2", devA);
  await check("ทดลองใช้ลงทะเบียนได้ 2 จุด จุดที่ 3 ถูกปฏิเสธ", () => rejects(registerDevice(a, "ประตู 3", devA), "2 จุด"));
  await check("เครื่องที่ไม่ได้ลงทะเบียน → ทำรายการไม่ได้", async () => (await checkStation(null, "CHECK_IN", devA)).ok === false);
  await check("เครื่องที่ลงทะเบียน → Check-in ได้", async () => (await checkStation(t1, "CHECK_IN", devA)).ok);
  await check("token ของ A ใช้กับองค์กร B ไม่ได้", async () => {
    const r = await checkStation(t1, "CHECK_IN", deviceDeps(B.id));
    return !r.ok && r.reason === "NO_DEVICE";
  });
  await prisma.organization.update({ where: { id: A.id }, data: { trialEndsAt: new Date(Date.now() - DAY) } });
  await check("หมดช่วงทดลอง → Check-in ไม่ได้ แต่ Check-out ได้", async () =>
    !(await checkStation(t1, "CHECK_IN", devA)).ok && (await checkStation(t1, "CHECK_OUT", devA)).ok);

  console.log("\nใบแจ้งหนี้ → สลิป → อนุมัติ");
  await check("ยังไม่มีข้อมูลใบกำกับภาษี → ออกใบแจ้งหนี้ไม่ได้", () => rejects(createInvoice(a, { points: 2, period: "MONTHLY", withholdingTax: false }, depsA), "ใบกำกับภาษี"));
  await saveBillingProfile(
    a,
    { legalName: "บริษัท ทดสอบ จำกัด", taxId: "1103700012346", branch: "", address: "99 ถนนทดสอบ แขวงทดสอบ กรุงเทพ 10110", billingEmail: "Acc@Test.co" },
    depsA,
  );
  await check("ซื้อน้อยกว่าจุดที่ลงทะเบียนอยู่ (2) → ไม่ผ่าน", () => rejects(createInvoice(a, { points: 1, period: "MONTHLY", withholdingTax: false }, depsA), "อย่างน้อย 2"));
  const inv = await createInvoice(a, { points: 3, period: "MONTHLY", withholdingTax: true }, depsA);
  await check("ออกใบแจ้งหนี้: เลขที่ INV-YYYYMM-NNNN + ยอดหัก ณ ที่จ่ายถูก", () =>
    /^INV-\d{6}-\d{4}$/.test(inv.number) && inv.netPayable === 1528.8 && inv.status === "PENDING_PAYMENT");
  await check("มีใบแจ้งหนี้ค้าง → ออกใบใหม่ไม่ได้", () => rejects(createInvoice(a, { points: 3, period: "MONTHLY", withholdingTax: false }, depsA), "ยังไม่ปิด"));
  await check("องค์กร B มองไม่เห็นใบแจ้งหนี้ของ A", async () => (await depsB.repo.invoice(inv.id)) === null);
  await check("ไฟล์ที่ไม่ใช่รูป/PDF → ไม่ผ่าน", () => rejects(uploadSlip(a, inv.id, { bytes: new TextEncoder().encode("hello"), transferredAt: null }, depsA), "JPG"));
  await check("B แนบสลิปให้ใบแจ้งหนี้ของ A ไม่ได้", () => rejects(uploadSlip(actor(B), inv.id, { bytes: PNG, transferredAt: null }, depsB), "ไม่พบ"));
  await uploadSlip(a, inv.id, { bytes: PNG, transferredAt: new Date() }, depsA);
  await check("แนบสลิป → รอตรวจ + แจ้งอีเมลผู้ให้บริการ", async () =>
    (await depsA.repo.invoice(inv.id))!.status === "PENDING_REVIEW" && outbox.some((m) => m.to === "ops@vms.test"));
  await check("ระหว่างรอตรวจ ยกเลิกใบแจ้งหนี้ไม่ได้", () => rejects(cancelInvoice(a, inv.id, depsA)));

  await rejectInvoice("platform", inv.id, "ยอดไม่ตรง", plat);
  await check("ไม่ผ่าน → สถานะ REJECTED + อีเมลแจ้งลูกค้า", async () =>
    (await depsA.repo.invoice(inv.id))!.status === "REJECTED" && outbox.some((m) => m.to === "acc@test.co" && m.subject.includes("ไม่ผ่าน")));
  await uploadSlip(a, inv.id, { bytes: PNG, transferredAt: null }, depsA);
  const before = Date.now();
  const r = await approveInvoice("platform", inv.id, plat);
  const orgAfter = await prisma.organization.findUniqueOrThrow({ where: { id: A.id } });
  await check("อนุมัติ → ใบเสร็จ RC-YYYYMM-NNNN", () => /^RC-\d{6}-\d{4}$/.test(r.receiptNumber));
  await check("อนุมัติ → องค์กร ACTIVE, ใช้ได้อีก ~1 เดือน, 3 จุด", () => {
    const days = (orgAfter.paidUntil!.getTime() - before) / DAY;
    return orgAfter.status === "ACTIVE" && days > 27 && days < 32 && orgAfter.checkInPointLimit === 3;
  });
  await check("อนุมัติซ้ำ → ไม่ผ่าน", () => rejects(approveInvoice("platform", inv.id, plat)));
  await check("หลังชำระ Check-in ได้อีกครั้ง และลงทะเบียนจุดที่ 3 ได้", async () => {
    const ok = (await checkStation(t1, "CHECK_IN", devA)).ok;
    await registerDevice(a, "ประตู 3", devA);
    return ok;
  });
  await check("ภาพรวมแสดงสถานะ ACTIVE และใช้ 3 จุด", async () => {
    const o = await billingOverview(a, depsA);
    return o.access.state === "ACTIVE" && o.activePoints === 3;
  });

  console.log("\nโควตาจุดลดลง");
  await prisma.organization.update({ where: { id: A.id }, data: { checkInPointLimit: 1 } });
  await check("ลดเหลือ 1 จุด → เครื่องแรกใช้ได้ เครื่องที่ 2 เกินโควตา", async () => {
    const r2 = await checkStation(t2, "CHECK_OUT", devA);
    return (await checkStation(t1, "CHECK_OUT", devA)).ok && !r2.ok && r2.reason === "OVER_LIMIT";
  });
  const list = await devA.devices.list();
  await revokeDevice(a, list[0].id, devA);
  await check("ยกเลิกเครื่องแรก → เครื่องที่ 2 ขึ้นมาอยู่ในโควตา", async () => (await checkStation(t2, "CHECK_OUT", devA)).ok);

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
