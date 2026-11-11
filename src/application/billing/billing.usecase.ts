import { createHash } from "node:crypto";
import { computeAccess, extendCoverage } from "@/domain/billing/access";
import { formatBaht, PRICING, quote, type BillingPeriod } from "@/domain/billing/pricing";
import { isValidThaiNationalId } from "@/domain/visit/id-masking";
import type { CurrentStaff } from "../auth/auth.types";
import type {
  BillingMailer,
  BillingProfileData,
  BillingRepository,
  DeviceRepository,
  PlatformBillingRepository,
  SlipCheck,
  SlipStorage,
} from "./billing.types";
import { APP_NAME } from "@/lib/brand";
import { checkSlip, type SlipCheckDeps } from "./slip-check.usecase";

export class BillingError extends Error {}

export interface BillingDeps {
  repo: BillingRepository;
  devices: DeviceRepository;
  slips: SlipStorage;
  mailer: BillingMailer;
  platformEmail: string | null;
  appUrl: string;
  slipCheck: SlipCheckDeps;
  /** ตั้งไว้ = อนุมัติอัตโนมัติเมื่อสลิปผ่านการตรวจกับธนาคารทุกข้อ */
  autoApprove: PlatformDeps | null;
  now?: () => Date;
}

export interface PlatformDeps {
  repo: PlatformBillingRepository;
  mailer: BillingMailer;
  appUrl: string;
  slips?: SlipStorage;
  slipCheck?: SlipCheckDeps;
  now?: () => Date;
}

/** ผู้อนุมัติที่บันทึกเมื่อระบบอนุมัติเอง */
export const AUTO_REVIEWER = "ระบบตรวจสลิปอัตโนมัติ";

function requireAdmin(actor: CurrentStaff) {
  if (actor.role !== "ADMIN") throw new BillingError("เฉพาะผู้ดูแลระบบ");
}

// ---------------- Overview ----------------

export async function billingOverview(actor: CurrentStaff, deps: BillingDeps) {
  requireAdmin(actor);
  const now = deps.now?.() ?? new Date();
  const [org, profile, invoices, activePoints] = await Promise.all([
    deps.repo.org(),
    deps.repo.profile(),
    deps.repo.invoices(24),
    deps.devices.activeCount(),
  ]);
  return { org, access: computeAccess(org, now), profile, invoices, activePoints, pricing: PRICING };
}

// ---------------- Billing profile ----------------

export function validateProfile(p: BillingProfileData): BillingProfileData {
  const v = {
    legalName: p.legalName.trim(),
    taxId: p.taxId.replace(/\D/g, ""),
    branch: p.branch.trim() || "สำนักงานใหญ่",
    address: p.address.trim(),
    billingEmail: p.billingEmail.trim().toLowerCase(),
  };
  if (v.legalName.length < 2 || v.legalName.length > 200) throw new BillingError("กรุณากรอกชื่อนิติบุคคล/ผู้ซื้อ");
  // เลขประจำตัวผู้เสียภาษี 13 หลัก ใช้ checksum เดียวกับเลขบัตรประชาชน
  if (!isValidThaiNationalId(v.taxId)) throw new BillingError("เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (13 หลัก)");
  if (v.address.length < 10 || v.address.length > 500) throw new BillingError("กรุณากรอกที่อยู่สำหรับออกใบกำกับภาษี");
  if (v.branch.length > 60) throw new BillingError("ชื่อสาขายาวเกินไป");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.billingEmail)) throw new BillingError("อีเมลรับเอกสารไม่ถูกต้อง");
  return v;
}

export async function saveBillingProfile(actor: CurrentStaff, p: BillingProfileData, deps: BillingDeps) {
  requireAdmin(actor);
  await deps.repo.saveProfile(validateProfile(p));
}

// ---------------- Invoices ----------------

export async function createInvoice(
  actor: CurrentStaff,
  input: { points: number; period: BillingPeriod; withholdingTax: boolean },
  deps: BillingDeps,
) {
  requireAdmin(actor);
  if (input.period !== "MONTHLY" && input.period !== "YEARLY") throw new BillingError("รอบบิลไม่ถูกต้อง");
  const profile = await deps.repo.profile();
  if (!profile) throw new BillingError("กรุณากรอกข้อมูลออกใบกำกับภาษีก่อน");
  const open = await deps.repo.openInvoice();
  if (open) throw new BillingError(`มีใบแจ้งหนี้ ${open.number} ที่ยังไม่ปิด — ชำระหรือยกเลิกก่อน`);
  const active = await deps.devices.activeCount();
  if (input.points < active) {
    throw new BillingError(`ตอนนี้ลงทะเบียนไว้ ${active} จุด — เลือกอย่างน้อย ${active} จุด หรือยกเลิกจุดที่ไม่ใช้ก่อน`);
  }
  let q;
  try {
    q = quote(Math.trunc(input.points), input.period, input.withholdingTax);
  } catch (e) {
    throw new BillingError((e as Error).message);
  }
  return deps.repo.createInvoice({ ...q, buyer: profile, createdBy: actor.username }, deps.now?.() ?? new Date());
}

export async function cancelInvoice(actor: CurrentStaff, invoiceId: string, deps: BillingDeps) {
  requireAdmin(actor);
  if (!(await deps.repo.cancel(invoiceId))) throw new BillingError("ยกเลิกไม่ได้ (ชำระแล้วหรือกำลังตรวจสลิป)");
}

const SLIP_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
export const SLIP_MAX_BYTES = 5 * 1024 * 1024;

/** ตรวจ magic bytes — ไม่เชื่อ Content-Type ที่ผู้ใช้ส่งมา */
export function sniffSlipType(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  return null;
}

export const slipHash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export async function uploadSlip(
  actor: CurrentStaff,
  invoiceId: string,
  file: { bytes: Uint8Array; transferredAt: Date | null },
  deps: BillingDeps,
): Promise<{ autoApproved: boolean; check: SlipCheck }> {
  requireAdmin(actor);
  const inv = await deps.repo.invoice(invoiceId);
  if (!inv) throw new BillingError("ไม่พบใบแจ้งหนี้");
  if (inv.status !== "PENDING_PAYMENT" && inv.status !== "REJECTED") throw new BillingError("ใบแจ้งหนี้นี้แนบสลิปไม่ได้แล้ว");
  if (file.bytes.length === 0 || file.bytes.length > SLIP_MAX_BYTES) throw new BillingError("ไฟล์ต้องไม่เกิน 5 MB");
  const mime = sniffSlipType(file.bytes);
  if (!mime || !SLIP_TYPES[mime]) throw new BillingError("รองรับเฉพาะรูป JPG / PNG / WEBP หรือ PDF");

  const now = deps.now?.() ?? new Date();
  const hash = slipHash(file.bytes);
  // สลิปซ้ำ — ไฟล์เดิม (ตรวจก่อนถามธนาคาร) หรือรายการโอนเดิม ที่ใช้กับใบแจ้งหนี้อื่นไปแล้ว
  const reused = async (transRef: string | null) => {
    const r = await deps.repo.findSlipReuse({ hash, transRef, exceptInvoiceId: inv.id });
    if (r) throw new BillingError(r.sameOrg ? `สลิปนี้ใช้กับใบแจ้งหนี้ ${r.number} ไปแล้ว` : "สลิปนี้ถูกใช้ชำระไปแล้ว ไม่สามารถใช้ซ้ำได้");
  };
  await reused(null);
  const check = await checkSlip(inv, { bytes: file.bytes, mime }, deps.slipCheck, now);
  if (check.transRef) await reused(check.transRef);
  // ธนาคารยืนยันว่าไม่มีรายการนี้ — ไม่รับสลิป ให้ลูกค้าตรวจและแนบใหม่
  if (check.providerStatus === "NOT_FOUND") {
    throw new BillingError("ธนาคารไม่พบรายการโอนตามสลิปนี้ — ตรวจว่าเป็นสลิปที่ถูกต้อง แล้วแนบใหม่");
  }

  const path = await deps.slips.save(file.bytes, mime);
  const transferredAt = check.transferredAt ? new Date(check.transferredAt) : file.transferredAt;
  if (!(await deps.repo.attachSlip(invoiceId, { path, hash, transRef: check.transRef, check, transferredAt }, now))) {
    throw new BillingError("แนบสลิปไม่สำเร็จ กรุณาลองใหม่");
  }

  const autoApproved = check.verdict === "PASS" && !!deps.autoApprove && (await tryAutoApprove(inv.id, check, deps.autoApprove));

  if (deps.platformEmail) {
    const subject = autoApproved
      ? `[${APP_NAME}] อนุมัติอัตโนมัติ ${inv.number} (${actor.orgName})`
      : `[${APP_NAME}] มีสลิปรอตรวจ ${inv.number} (${actor.orgName})`;
    const note = autoApproved ? "สลิปผ่านการตรวจกับธนาคาร ระบบออกใบเสร็จให้แล้ว" : check.reasons.join(" / ") || "รอตรวจ";
    await deps.mailer
      .send(
        deps.platformEmail,
        subject,
        `${actor.orgName} (${actor.orgSlug}) แนบสลิปสำหรับ ${inv.number} ยอด ${formatBaht(inv.netPayable)} บาท\n${note}\nดูที่ ${deps.appUrl}/platform/billing`,
        `<p><b>${esc(actor.orgName)}</b> แนบสลิปสำหรับ ${inv.number} ยอด ${formatBaht(inv.netPayable)} บาท</p><p>${esc(note)}</p><p><a href="${deps.appUrl}/platform/billing">ดูรายการ</a></p>`,
      )
      .catch((e) => console.error("[billing] notify platform failed", e));
  }
  return { autoApproved, check };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function tryAutoApprove(invoiceId: string, check: SlipCheck, deps: PlatformDeps): Promise<boolean> {
  try {
    await approveInvoice(AUTO_REVIEWER, invoiceId, deps);
    await deps.repo.saveSlipCheck(invoiceId, { ...check, autoApproved: true }, check.transRef);
    return true;
  } catch (e) {
    // เช่น รายการโอนเดียวกันถูกอนุมัติกับใบแจ้งหนี้อื่นพร้อมกัน — ปล่อยให้คนตรวจ
    console.error("[billing] auto-approve failed", e);
    return false;
  }
}

/** ผู้ให้บริการสั่งตรวจสลิปกับธนาคารอีกครั้ง (เช่น ครั้งแรกธนาคารยังไม่ยืนยัน หรือเชื่อมต่อไม่ได้) */
export async function recheckSlip(invoiceId: string, deps: PlatformDeps): Promise<{ autoApproved: boolean; check: SlipCheck }> {
  if (!deps.slips || !deps.slipCheck) throw new BillingError("ระบบตรวจสลิปไม่พร้อม");
  const inv = await deps.repo.invoice(invoiceId);
  if (!inv) throw new BillingError("ไม่พบใบแจ้งหนี้");
  if (inv.status !== "PENDING_REVIEW" || !inv.slipPath) throw new BillingError("ใบแจ้งหนี้นี้ไม่ได้รอตรวจ");
  const file = await deps.slips.read(inv.slipPath);
  if (!file) throw new BillingError("ไม่พบไฟล์สลิป");

  const check = await checkSlip(inv, { bytes: file.data, mime: file.mime }, deps.slipCheck, deps.now?.() ?? new Date());
  const reuse = await deps.repo.findSlipReuse({ hash: slipHash(file.data), transRef: check.transRef, exceptInvoiceId: inv.id });
  if (reuse) {
    check.verdict = "REVIEW";
    check.reasons.push(`สลิปซ้ำกับใบแจ้งหนี้ ${reuse.number}`);
  }
  await deps.repo.saveSlipCheck(inv.id, check, check.transRef);
  return { autoApproved: false, check };
}

// ---------------- Platform review ----------------

export async function approveInvoice(reviewer: string, invoiceId: string, deps: PlatformDeps) {
  const inv = await deps.repo.invoice(invoiceId);
  if (!inv) throw new BillingError("ไม่พบใบแจ้งหนี้");
  if (inv.status !== "PENDING_REVIEW") throw new BillingError("ใบแจ้งหนี้นี้ไม่ได้รอตรวจ");
  const r = await deps.repo.approve(invoiceId, reviewer, deps.now?.() ?? new Date());
  if (!r) throw new BillingError("อนุมัติไม่สำเร็จ — สถานะเปลี่ยนไปแล้ว");

  const to = await deps.repo.billingEmail(inv.organizationId);
  if (to) {
    const until = r.coverUntil.toLocaleDateString("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" });
    await deps.mailer
      .send(
        to,
        `[${APP_NAME}] ได้รับชำระเงินแล้ว — ใบเสร็จ ${r.receiptNumber}`,
        `ได้รับชำระ ${inv.number} แล้ว ใช้งานได้ ${inv.points} จุด ถึง ${until}\nดาวน์โหลดใบเสร็จรับเงิน/ใบกำกับภาษี: ${deps.appUrl}/billing/invoices/${inv.id}`,
        `<p>ได้รับชำระ ${inv.number} แล้ว ใช้งานได้ <b>${inv.points} จุด</b> ถึง <b>${until}</b></p><p><a href="${deps.appUrl}/billing/invoices/${inv.id}">ใบเสร็จรับเงิน/ใบกำกับภาษี ${r.receiptNumber}</a></p>`,
      )
      .catch((e) => console.error("[billing] notify customer failed", e));
  }
  return r;
}

export async function rejectInvoice(reviewer: string, invoiceId: string, note: string, deps: PlatformDeps) {
  const reason = note.trim().slice(0, 300);
  if (reason.length < 3) throw new BillingError("กรุณาระบุเหตุผล");
  const inv = await deps.repo.invoice(invoiceId);
  if (!inv) throw new BillingError("ไม่พบใบแจ้งหนี้");
  if (!(await deps.repo.reject(invoiceId, reviewer, reason))) throw new BillingError("ปฏิเสธไม่สำเร็จ — สถานะเปลี่ยนไปแล้ว");
  const to = await deps.repo.billingEmail(inv.organizationId);
  if (to) {
    await deps.mailer
      .send(
        to,
        `[${APP_NAME}] สลิป ${inv.number} ไม่ผ่านการตรวจ`,
        `เหตุผล: ${reason}\nแนบสลิปใหม่ได้ที่ ${deps.appUrl}/billing`,
        `<p>สลิปสำหรับ ${inv.number} ไม่ผ่านการตรวจ</p><p>เหตุผล: ${reason.replace(/</g, "&lt;")}</p><p><a href="${deps.appUrl}/billing">แนบสลิปใหม่</a></p>`,
      )
      .catch((e) => console.error("[billing] notify customer failed", e));
  }
}

export { extendCoverage };
