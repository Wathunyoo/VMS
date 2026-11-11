import { BANK_CODES, accountNameMatches, maskedAccountMatches, parseSlipQr } from "@/domain/billing/slip-qr";
import type { InvoiceRecord, PayeeAccounts, SlipCheck, SlipProvider, SlipQrReader } from "./billing.types";

export interface SlipCheckDeps {
  qr: SlipQrReader;
  /** null = ไม่ได้ตั้งผู้ให้บริการตรวจสลิป → ตรวจได้แค่ QR และสลิปซ้ำ แล้วให้คนตรวจ */
  provider: SlipProvider | null;
  payee: PayeeAccounts;
}

/** ยอมให้เวลาบนสลิปก่อนออกใบแจ้งหนี้ได้เล็กน้อย (นาฬิกาไม่ตรงกัน) */
const EARLY_SLACK_MS = 10 * 60_000;

/**
 * ตรวจสลิปกับใบแจ้งหนี้
 *  1. อ่าน QR บนสลิป (ในเครื่อง) → เลขอ้างอิงรายการ
 *  2. ถามผู้ให้บริการตรวจสลิป (ถ้าตั้งไว้) → ยอดเงิน ผู้รับ วันเวลา จากธนาคาร
 *  3. เทียบยอดเงิน / บัญชีผู้รับ / เวลาโอน
 * ผ่านทุกข้อ = PASS (อนุมัติอัตโนมัติได้) · ไม่เช่นนั้น REVIEW พร้อมเหตุผล
 */
export async function checkSlip(
  inv: Pick<InvoiceRecord, "netPayable" | "createdAt">,
  file: { bytes: Uint8Array; mime: string },
  deps: SlipCheckDeps,
  now: Date,
): Promise<SlipCheck> {
  const reasons: string[] = [];
  const c: SlipCheck = {
    checkedAt: now.toISOString(),
    qrFound: false,
    transRef: null,
    sendingBank: null,
    provider: deps.provider?.name ?? null,
    providerStatus: "SKIPPED",
    providerMessage: null,
    amount: null,
    amountOk: null,
    receiver: null,
    receiverOk: null,
    sender: null,
    transferredAt: null,
    dateOk: null,
    verdict: "REVIEW",
    reasons,
  };

  let raw: string | null = null;
  if (file.mime === "application/pdf") {
    reasons.push("สลิปเป็น PDF — ระบบอ่าน QR ไม่ได้ ต้องตรวจด้วยตนเอง");
  } else {
    raw = await deps.qr.read(file.bytes, file.mime).catch(() => null);
  }
  const qr = raw ? parseSlipQr(raw) : null;
  if (file.mime !== "application/pdf") {
    if (!raw) reasons.push("ไม่พบ QR บนสลิป — อาจเป็นภาพที่ถูกตัด/แก้ไข หรือภาพไม่ชัด");
    else if (!qr) reasons.push("QR บนรูปไม่ใช่ QR ตรวจสอบสลิปของธนาคาร");
  }
  if (qr) {
    c.qrFound = true;
    c.transRef = qr.transRef;
    c.sendingBank = BANK_CODES[qr.sendingBank] ?? qr.sendingBank;
    if (!qr.crcOk) reasons.push("รหัสตรวจสอบ (CRC) ของ QR ไม่ถูกต้อง");
  }

  if (!deps.provider) {
    reasons.push("ยังไม่ได้ตั้งค่าบริการตรวจสลิปกับธนาคาร — ตรวจยอดในบัญชีด้วยตนเอง");
    return c;
  }
  if (!qr) return c;

  const r = await deps.provider.verify(qr.payload).catch((e: Error) => ({ kind: "ERROR" as const, message: e.message }));
  c.providerStatus = r.kind;
  if (r.kind === "NOT_FOUND") {
    reasons.push("ธนาคารไม่พบรายการโอนนี้ — อาจเป็นสลิปปลอม");
    return c;
  }
  if (r.kind === "PENDING") {
    reasons.push("ธนาคารยังไม่ยืนยันรายการ (ลองตรวจอีกครั้งภายหลัง)");
    return c;
  }
  if (r.kind === "ERROR") {
    c.providerMessage = r.message.slice(0, 200);
    reasons.push("เชื่อมต่อบริการตรวจสลิปไม่สำเร็จ — ลองตรวจอีกครั้งภายหลัง");
    return c;
  }

  if (r.transRef && r.transRef !== qr.transRef) reasons.push("เลขอ้างอิงจากธนาคารไม่ตรงกับ QR");
  c.amount = r.amount;
  c.amountOk = Math.abs(r.amount - inv.netPayable) < 0.005;
  if (!c.amountOk) reasons.push(`ยอดโอน ${r.amount.toFixed(2)} ไม่ตรงกับยอดที่ต้องชำระ ${inv.netPayable.toFixed(2)}`);

  c.receiver = [r.receiverName, r.receiverAccount ?? r.receiverProxy, r.receiverBank].filter(Boolean).join(" · ") || null;
  const p = deps.payee;
  c.receiverOk =
    r.providerAccountMatched ||
    maskedAccountMatches(r.receiverAccount, p.accountNo) ||
    maskedAccountMatches(r.receiverProxy, p.promptPayId) ||
    maskedAccountMatches(r.receiverAccount, p.promptPayId) ||
    // ไม่มีเลขบัญชีให้เทียบ → ใช้ชื่อบัญชี
    (!p.accountNo && !p.promptPayId && accountNameMatches(r.receiverName, p.accountName));
  if (!c.receiverOk) reasons.push("ผู้รับเงินบนสลิปไม่ใช่บัญชีของเรา");

  c.sender = [r.senderName, r.senderBank].filter(Boolean).join(" · ") || null;
  c.transferredAt = r.date.toISOString();
  c.dateOk = r.date.getTime() >= inv.createdAt.getTime() - EARLY_SLACK_MS && r.date.getTime() <= now.getTime() + EARLY_SLACK_MS;
  if (!c.dateOk) reasons.push("เวลาโอนอยู่ก่อนวันที่ออกใบแจ้งหนี้ — อาจเป็นสลิปเก่า");

  if (reasons.length === 0) c.verdict = "PASS";
  return c;
}
