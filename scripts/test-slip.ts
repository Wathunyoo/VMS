/**
 * ทดสอบระบบตรวจสลิปอัตโนมัติ
 *   npm run test:slip
 * ใช้ผู้ให้บริการตรวจสลิปจำลอง (ไม่เรียก API จริง) สร้างองค์กรทดสอบแล้วลบทิ้งเมื่อจบ
 * และคืนตัวนับเลขที่เอกสารเป็นค่าเดิม
 */
import "dotenv/config";
import { rm } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";
import type { CurrentStaff } from "@/application/auth/auth.types";
import type { BillingMailer, SlipProvider, SlipProviderResult } from "@/application/billing/billing.types";
import { AUTO_REVIEWER, createInvoice, recheckSlip, saveBillingProfile, uploadSlip, type BillingDeps, type PlatformDeps } from "@/application/billing/billing.usecase";
import { checkSlip, type SlipCheckDeps } from "@/application/billing/slip-check.usecase";
import { billingDeps, platformDeps } from "@/container";
import { crc16 } from "@/domain/billing/promptpay";
import { accountNameMatches, maskedAccountMatches, parseSlipQr } from "@/domain/billing/slip-qr";
import { easySlipProvider } from "@/infrastructure/billing/easyslip";
import { localSlipQrReader } from "@/infrastructure/billing/slip-qr-reader";
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

const SLUGS = ["t-slip-a", "t-slip-b"];
const outbox: { to: string; subject: string }[] = [];
const fakeMailer: BillingMailer = { send: async (to, subject) => void outbox.push({ to, subject }) };
let counterSnapshot: { key: string; value: number }[] | null = null;

async function cleanup() {
  if (counterSnapshot) {
    const keep = new Map(counterSnapshot.map((c) => [c.key, c.value]));
    for (const c of await prisma.documentCounter.findMany()) {
      if (!keep.has(c.key)) await prisma.documentCounter.delete({ where: { key: c.key } });
      else if (keep.get(c.key) !== c.value) await prisma.documentCounter.update({ where: { key: c.key }, data: { value: keep.get(c.key)! } });
    }
  }
  const ids = (await prisma.organization.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } })).map((o) => o.id);
  if (!ids.length) return;
  const where = { organizationId: { in: ids } };
  const files = (await prisma.invoice.findMany({ where, select: { slipPath: true } })).flatMap((i) => (i.slipPath ? [i.slipPath] : []));
  await prisma.invoice.deleteMany({ where });
  await prisma.billingProfile.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  for (const f of files) await rm(path.join(process.cwd(), "storage", "slips", f), { force: true });
}

const actor = (org: { id: string; slug: string; name: string }): CurrentStaff => ({
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
});

const tlv = (id: string, v: string) => `${id}${String(v.length).padStart(2, "0")}${v}`;
/** QR ตรวจสอบสลิปแบบเดียวกับที่ธนาคารพิมพ์บนสลิป */
function slipPayload(transRef: string, bank = "004") {
  const body = tlv("00", tlv("00", "000001") + tlv("01", bank) + tlv("02", transRef)) + tlv("51", "TH") + "9104";
  return body + crc16(body);
}
/** ภาพสลิปจำลอง: พื้นขาวขนาดมือถือ มี QR เล็กที่มุมล่างขวา */
async function slipImage(payload: string, format: "png" | "jpeg" = "jpeg"): Promise<Uint8Array> {
  const qr = await QRCode.toBuffer(payload, { width: 170, margin: 2 });
  const img = sharp({ create: { width: 1080, height: 1920, channels: 3, background: "#f4f6f8" } }).composite([
    { input: { create: { width: 900, height: 120, channels: 3, background: "#1b8f3a" } }, top: 120, left: 90 },
    { input: qr, top: 1640, left: 860 },
  ]);
  return new Uint8Array(format === "png" ? await img.png().toBuffer() : await img.jpeg({ quality: 88 }).toBuffer());
}

const PAYEE = { accountNo: "1234567890", promptPayId: "0812345678", accountName: "บริษัท วีเอ็มเอส คลาวด์ จำกัด" };
type Fake = Partial<Extract<SlipProviderResult, { kind: "VERIFIED" }>>;
let providerResponse: (payload: string) => SlipProviderResult;
let providerCalls = 0;
const fakeProvider: SlipProvider = {
  name: "ทดสอบ",
  verify: async (payload) => {
    providerCalls++;
    return providerResponse(payload);
  },
};
const verified = (transRef: string, amount: number, date: Date, over: Fake = {}): SlipProviderResult => ({
  kind: "VERIFIED",
  transRef,
  amount,
  date,
  senderName: "นาย ทดสอบ ส.",
  senderBank: "KBANK",
  receiverName: "บจก. วีเอ็มเอส ค",
  receiverAccount: "xxx-x-x5678-x",
  receiverProxy: null,
  receiverBank: "SCB",
  providerAccountMatched: false,
  ...over,
});

async function main() {
  await cleanup();
  counterSnapshot = await prisma.documentCounter.findMany();

  console.log("\nอ่าน QR บนสลิป");
  const p1 = slipPayload("016279143547BOR04412");
  await check("แยกเลขอ้างอิงรายการ + ธนาคารผู้โอน + CRC ถูก", () => {
    const q = parseSlipQr(p1);
    return q?.transRef === "016279143547BOR04412" && q.sendingBank === "004" && q.crcOk;
  });
  await check("CRC ผิด → ระบุว่าไม่ถูกต้อง", () => parseSlipQr(p1.slice(0, -4) + "0000")?.crcOk === false);
  await check("QR อื่น (PromptPay / URL) → ไม่ใช่ QR สลิป", () =>
    parseSlipQr("00020101021229370016A000000677010111011300668123456785802TH530376463041234") === null && parseSlipQr("https://example.com") === null);
  await check("อ่าน QR จากภาพสลิป JPG (QR เล็กมุมล่าง) ได้", async () => (await localSlipQrReader.read(await slipImage(p1), "image/jpeg")) === p1);
  await check("อ่าน QR จากภาพ PNG ได้", async () => (await localSlipQrReader.read(await slipImage(p1, "png"), "image/png")) === p1);
  await check("ภาพไม่มี QR → null", async () => {
    const blank = new Uint8Array(await sharp({ create: { width: 600, height: 900, channels: 3, background: "#fff" } }).jpeg().toBuffer());
    return (await localSlipQrReader.read(blank, "image/jpeg")) === null;
  });

  console.log("\nเทียบบัญชีผู้รับ");
  await check("เลขบัญชีปิดบางหลักตรงกัน", () => maskedAccountMatches("xxx-x-x5678-x", "123-4-56789-0") === false && maskedAccountMatches("xxx-x-x6789-x", "123-4-56789-0"));
  await check("เลขบัญชีคนละบัญชี → ไม่ตรง", () => !maskedAccountMatches("xxx-x-x1111-x", "1234567890"));
  await check("เห็นน้อยกว่า 3 หลัก → ไม่ถือว่าตรง", () => !maskedAccountMatches("xxx-x-xxxx9-0", "1234567890"));
  await check("PromptPay เบอร์มือถือ (066 / 0) ตรงกัน", () => maskedAccountMatches("xxx-xxx-5678", "0812345678") && maskedAccountMatches("66xxxxx5678", "0812345678"));
  await check("ชื่อบัญชีที่ถูกตัดบนสลิป ตรงกับชื่อเต็ม", () =>
    accountNameMatches("บจก. วีเอ็มเอส ค", PAYEE.accountName) && !accountNameMatches("บจก. อื่น ๆ", PAYEE.accountName));

  console.log("\nตรวจสลิปกับใบแจ้งหนี้");
  const invoiceAt = new Date(Date.now() - 60 * 60_000);
  const inv = { netPayable: 1528.8, createdAt: invoiceAt };
  const img1 = await slipImage(p1);
  const deps: SlipCheckDeps = { qr: localSlipQrReader, provider: fakeProvider, payee: PAYEE };
  // บัญชีรับเงิน 1234567890 → บนสลิป "xxx-x-x6789-x"
  const recv = { receiverAccount: "xxx-x-x6789-x" };
  const now = new Date();
  providerResponse = () => verified("016279143547BOR04412", 1528.8, new Date(), recv);
  await check("ยอด ผู้รับ เวลา ตรงทั้งหมด → PASS", async () => {
    const c = await checkSlip(inv, { bytes: img1, mime: "image/jpeg" }, deps, now);
    return c.verdict === "PASS" && c.amountOk === true && c.receiverOk === true && c.dateOk === true && c.reasons.length === 0;
  });
  providerResponse = () => verified("016279143547BOR04412", 1500, new Date(), recv);
  await check("ยอดไม่ตรง → REVIEW พร้อมเหตุผล", async () => {
    const c = await checkSlip(inv, { bytes: img1, mime: "image/jpeg" }, deps, now);
    return c.verdict === "REVIEW" && c.amountOk === false && c.reasons.some((r) => r.includes("ยอดโอน"));
  });
  providerResponse = () => verified("016279143547BOR04412", 1528.8, new Date(), { receiverAccount: "xxx-x-x1111-x", receiverName: "นาย อื่น" });
  await check("โอนเข้าบัญชีอื่น → REVIEW", async () => (await checkSlip(inv, { bytes: img1, mime: "image/jpeg" }, deps, now)).receiverOk === false);
  providerResponse = () => verified("016279143547BOR04412", 1528.8, new Date(), { receiverAccount: null, providerAccountMatched: true });
  await check("ผู้ให้บริการยืนยันบัญชีที่ลงทะเบียน → ผู้รับตรง", async () => (await checkSlip(inv, { bytes: img1, mime: "image/jpeg" }, deps, now)).receiverOk === true);
  providerResponse = () => verified("016279143547BOR04412", 1528.8, new Date(invoiceAt.getTime() - 3 * 86_400_000), recv);
  await check("สลิปเก่า (ก่อนออกใบแจ้งหนี้) → REVIEW", async () => (await checkSlip(inv, { bytes: img1, mime: "image/jpeg" }, deps, now)).dateOk === false);
  providerResponse = () => ({ kind: "PENDING" });
  await check("ธนาคารยังไม่ยืนยัน → REVIEW", async () => {
    const c = await checkSlip(inv, { bytes: img1, mime: "image/jpeg" }, deps, now);
    return c.verdict === "REVIEW" && c.providerStatus === "PENDING";
  });
  await check("ไม่ได้ตั้งผู้ให้บริการ → อ่าน QR ได้ แต่ให้คนตรวจ", async () => {
    const c = await checkSlip(inv, { bytes: img1, mime: "image/jpeg" }, { ...deps, provider: null }, now);
    return c.verdict === "REVIEW" && c.qrFound && c.transRef === "016279143547BOR04412" && c.providerStatus === "SKIPPED";
  });
  await check("PDF → ข้ามการอ่าน QR ให้คนตรวจ", async () => {
    const before = providerCalls;
    const c = await checkSlip(inv, { bytes: new TextEncoder().encode("%PDF-1.4"), mime: "application/pdf" }, deps, now);
    return c.verdict === "REVIEW" && !c.qrFound && providerCalls === before;
  });

  console.log("\nEasySlip (จำลอง API)");
  const fakeFetch = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  await check("แปลงผลตรวจสำเร็จ", async () => {
    const r = await easySlipProvider(
      "k",
      fakeFetch(200, {
        success: true,
        data: {
          matchedAccount: { bankNumber: "x" },
          rawSlip: {
            transRef: "T1",
            date: "2026-10-07T03:00:00+07:00",
            amount: { amount: 1528.8 },
            sender: { bank: { short: "KBANK" }, account: { name: { th: "นาย ก" } } },
            receiver: { bank: { short: "SCB" }, account: { name: { th: "บจก. ข" }, bank: { account: "xxx-x-x6789-x" } } },
          },
        },
      }),
    ).verify("x");
    return r.kind === "VERIFIED" && r.amount === 1528.8 && r.receiverAccount === "xxx-x-x6789-x" && r.providerAccountMatched && r.date.toISOString() === "2026-10-06T20:00:00.000Z";
  });
  await check("SLIP_NOT_FOUND / SLIP_PENDING / 401", async () => {
    const nf = await easySlipProvider("k", fakeFetch(404, { success: false, error: { code: "SLIP_NOT_FOUND" } })).verify("x");
    const pe = await easySlipProvider("k", fakeFetch(404, { success: false, error: { code: "SLIP_PENDING" } })).verify("x");
    const un = await easySlipProvider("k", fakeFetch(401, { success: false, error: { code: "UNAUTHORIZED", message: "bad key" } })).verify("x");
    return nf.kind === "NOT_FOUND" && pe.kind === "PENDING" && un.kind === "ERROR";
  });

  // --- ระบบจริง (DB) ---
  console.log("\nแนบสลิป → อนุมัติอัตโนมัติ");
  const A = await prisma.organization.create({ data: { slug: SLUGS[0], name: "Slip A", status: "TRIAL", trialEndsAt: new Date(Date.now() + 5 * 86_400_000), onboardedAt: new Date() } });
  const B = await prisma.organization.create({ data: { slug: SLUGS[1], name: "Slip B", status: "TRIAL", trialEndsAt: new Date(Date.now() + 5 * 86_400_000), onboardedAt: new Date() } });
  const plat: PlatformDeps = { ...platformDeps(), mailer: fakeMailer, slipCheck: deps };
  const mk = (orgId: string, auto: boolean): BillingDeps => ({
    ...billingDeps(orgId),
    mailer: fakeMailer,
    platformEmail: "ops@vms.test",
    slipCheck: deps,
    autoApprove: auto ? plat : null,
  });
  const depsA = mk(A.id, true);
  const depsB = mk(B.id, true);
  const profile = { legalName: "บริษัท ทดสอบ จำกัด", taxId: "1103700012346", branch: "", address: "99 ถนนทดสอบ แขวงทดสอบ กรุงเทพ 10110", billingEmail: "acc@test.co" };
  await saveBillingProfile(actor(A), profile, depsA);
  await saveBillingProfile(actor(B), profile, depsB);

  const invA = await createInvoice(actor(A), { points: 3, period: "MONTHLY", withholdingTax: true }, depsA);
  providerResponse = () => ({ kind: "NOT_FOUND" });
  await check("ธนาคารไม่พบรายการ → ไม่รับสลิป (ใบแจ้งหนี้ยังรอชำระ)", async () =>
    (await rejects(uploadSlip(actor(A), invA.id, { bytes: img1, transferredAt: null }, depsA), "ไม่พบรายการ")) &&
    (await depsA.repo.invoice(invA.id))!.status === "PENDING_PAYMENT");

  providerResponse = () => verified("016279143547BOR04412", invA.netPayable, new Date(), recv);
  const up = await uploadSlip(actor(A), invA.id, { bytes: img1, transferredAt: null }, depsA);
  const paid = await depsA.repo.invoice(invA.id);
  const orgA = await prisma.organization.findUniqueOrThrow({ where: { id: A.id } });
  await check("สลิปผ่าน → อนุมัติอัตโนมัติ ออกใบเสร็จ ต่ออายุ", () =>
    up.autoApproved && paid!.status === "PAID" && /^RC-/.test(paid!.receiptNumber ?? "") && orgA.status === "ACTIVE" && orgA.checkInPointLimit === 3);
  await check("บันทึกผู้อนุมัติ = ระบบ + ผลตรวจ autoApproved", async () => {
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: invA.id } });
    return row.reviewedBy === AUTO_REVIEWER && paid!.slipCheck?.autoApproved === true && row.slipTransRef === "016279143547BOR04412";
  });
  await check("เวลาโอนบันทึกตามข้อมูลธนาคาร", () => !!paid!.transferredAt);
  await check("แจ้งผู้ให้บริการว่าอนุมัติอัตโนมัติ + ส่งใบเสร็จให้ลูกค้า", () =>
    outbox.some((m) => m.to === "ops@vms.test" && m.subject.includes("อัตโนมัติ")) && outbox.some((m) => m.to === "acc@test.co" && m.subject.includes("ใบเสร็จ")));

  console.log("\nกันสลิปซ้ำ");
  const invB = await createInvoice(actor(B), { points: 3, period: "MONTHLY", withholdingTax: true }, depsB);
  const callsBefore = providerCalls;
  await check("องค์กรอื่นใช้ไฟล์สลิปเดิม → ไม่ผ่าน (ไม่บอกเลขที่ของคนอื่น)", async () => {
    const ok = await rejects(uploadSlip(actor(B), invB.id, { bytes: img1, transferredAt: null }, depsB), "ถูกใช้ชำระไปแล้ว");
    return ok && providerCalls === callsBefore; // ไฟล์ซ้ำ → ไม่ต้องถามธนาคาร
  });
  const img1b = await slipImage(p1, "png"); // ไฟล์ต่างกัน แต่รายการโอนเดิม
  await check("รายการโอนเดิม (ไฟล์ใหม่) → ไม่ผ่าน", () => rejects(uploadSlip(actor(B), invB.id, { bytes: img1b, transferredAt: null }, depsB), "ถูกใช้ชำระไปแล้ว"));
  const invA2 = await createInvoice(actor(A), { points: 3, period: "MONTHLY", withholdingTax: false }, depsA);
  await check("องค์กรเดียวกันใช้สลิปเดิม → บอกเลขใบแจ้งหนี้เดิม", () =>
    rejects(uploadSlip(actor(A), invA2.id, { bytes: img1, transferredAt: null }, depsA), invA.number));
  await check("ฐานข้อมูลกันรายการโอนเดียวปิดใบแจ้งหนี้ 2 ใบ", () =>
    rejects(prisma.invoice.update({ where: { id: invA2.id }, data: { status: "PAID", slipTransRef: "016279143547BOR04412" } })));

  console.log("\nส่งให้คนตรวจ + ตรวจอีกครั้ง");
  const p2 = slipPayload("2026100799887766AB12", "014");
  const img2 = await slipImage(p2);
  providerResponse = () => ({ kind: "PENDING" });
  const up2 = await uploadSlip(actor(B), invB.id, { bytes: img2, transferredAt: null }, depsB);
  const pendingB = await depsB.repo.invoice(invB.id);
  await check("ธนาคารยังไม่ยืนยัน → รอคนตรวจ พร้อมผลตรวจ", () =>
    !up2.autoApproved && pendingB!.status === "PENDING_REVIEW" && pendingB!.slipCheck?.providerStatus === "PENDING" && pendingB!.slipCheck.transRef === "2026100799887766AB12");
  providerResponse = () => verified("2026100799887766AB12", invB.netPayable, new Date(), recv);
  await recheckSlip(invB.id, plat);
  const rechecked = await depsB.repo.invoice(invB.id);
  await check("ตรวจอีกครั้ง → อัปเดตผลเป็น PASS (ยังให้คนกดอนุมัติ)", () => rechecked!.slipCheck?.verdict === "PASS" && rechecked!.status === "PENDING_REVIEW");
  await check("ตรวจอีกครั้งกับใบแจ้งหนี้ที่ไม่มี → ไม่พบ", () => rejects(recheckSlip("nope", plat), "ไม่พบ"));

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
