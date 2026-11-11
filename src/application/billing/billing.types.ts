import type { BillingPeriod } from "@/domain/billing/pricing";

export type InvoiceStatus = "PENDING_PAYMENT" | "PENDING_REVIEW" | "PAID" | "REJECTED" | "CANCELLED";

export interface BillingProfileData {
  legalName: string;
  taxId: string;
  branch: string;
  address: string;
  billingEmail: string;
}

export interface OrgBillingState {
  id: string;
  slug: string;
  name: string;
  status: string;
  trialEndsAt: Date | null;
  paidUntil: Date | null;
  checkInPointLimit: number;
}

export interface InvoiceRecord {
  id: string;
  organizationId: string;
  number: string;
  status: InvoiceStatus;
  period: BillingPeriod;
  points: number;
  months: number;
  unitPrice: number;
  subtotal: number;
  vat: number;
  total: number;
  withholding: number;
  netPayable: number;
  buyer: BillingProfileData;
  slipPath: string | null;
  slipUploadedAt: Date | null;
  transferredAt: Date | null;
  reviewNote: string | null;
  receiptNumber: string | null;
  slipCheck: SlipCheck | null;
  paidAt: Date | null;
  coverFrom: Date | null;
  coverUntil: Date | null;
  createdAt: Date;
}

export interface NewInvoice {
  period: BillingPeriod;
  points: number;
  months: number;
  unitPrice: number;
  subtotal: number;
  vat: number;
  total: number;
  withholding: number;
  netPayable: number;
  buyer: BillingProfileData;
  createdBy: string;
}

/** repository ขององค์กรหนึ่ง (ผูก orgId แล้ว) */
export interface BillingRepository {
  org(): Promise<OrgBillingState>;
  profile(): Promise<BillingProfileData | null>;
  saveProfile(p: BillingProfileData): Promise<void>;
  invoices(limit: number): Promise<InvoiceRecord[]>;
  invoice(id: string): Promise<InvoiceRecord | null>;
  /** ใบแจ้งหนี้ที่ยังไม่ปิด (รอโอน / รอตรวจ / ถูกปฏิเสธ) */
  openInvoice(): Promise<InvoiceRecord | null>;
  createInvoice(inv: NewInvoice, now: Date): Promise<InvoiceRecord>;
  attachSlip(
    id: string,
    slip: { path: string; hash: string; transRef: string | null; check: SlipCheck; transferredAt: Date | null },
    at: Date,
  ): Promise<boolean>;
  /** สลิปเดียวกัน (hash ไฟล์หรือเลขอ้างอิงรายการ) ที่ใช้กับใบแจ้งหนี้อื่นที่ชำระแล้ว/รอตรวจ — ทั้งแพลตฟอร์ม */
  findSlipReuse(q: { hash: string; transRef: string | null; exceptInvoiceId: string }): Promise<SlipReuse | null>;
  cancel(id: string): Promise<boolean>;
}

/** การตรวจสลิปของผู้ให้บริการ — ข้ามองค์กร */
export interface PlatformBillingRepository {
  pendingReview(): Promise<(InvoiceRecord & { orgSlug: string; orgName: string })[]>;
  recent(limit: number): Promise<(InvoiceRecord & { orgSlug: string; orgName: string })[]>;
  invoice(id: string): Promise<(InvoiceRecord & { orgSlug: string; orgName: string }) | null>;
  /** อนุมัติ: ปิดใบแจ้งหนี้ + ออกเลขใบเสร็จ + ต่ออายุองค์กร (atomic) — false ถ้าสถานะเปลี่ยนไปแล้ว */
  approve(id: string, by: string, at: Date): Promise<{ receiptNumber: string; coverUntil: Date } | null>;
  reject(id: string, by: string, note: string): Promise<boolean>;
  saveSlipCheck(id: string, check: SlipCheck, transRef: string | null): Promise<void>;
  findSlipReuse(q: { hash: string; transRef: string | null; exceptInvoiceId: string }): Promise<SlipReuse | null>;
  billingEmail(organizationId: string): Promise<string | null>;
}

export interface SlipStorage {
  save(bytes: Uint8Array, mime: string): Promise<string>;
  read(path: string): Promise<{ data: Uint8Array; mime: string } | null>;
}

// ---------------- Slip verification ----------------

/** สลิปที่เคยใช้แล้ว — เลขที่ใบแจ้งหนี้แสดงเฉพาะเมื่อเป็นขององค์กรเดียวกัน */
export interface SlipReuse {
  number: string;
  sameOrg: boolean;
}

/** อ่าน QR จากรูปสลิป — ทำในเครื่อง ไม่ส่งรูปออกไปไหน */
export interface SlipQrReader {
  read(bytes: Uint8Array, mime: string): Promise<string | null>;
}

export type SlipProviderResult =
  | {
      kind: "VERIFIED";
      transRef: string;
      amount: number;
      date: Date;
      senderName: string | null;
      senderBank: string | null;
      receiverName: string | null;
      receiverAccount: string | null;
      receiverProxy: string | null;
      receiverBank: string | null;
      /** ผู้ให้บริการยืนยันว่าเป็นบัญชีที่ลงทะเบียนไว้ */
      providerAccountMatched: boolean;
    }
  | { kind: "NOT_FOUND" }
  | { kind: "PENDING" }
  | { kind: "ERROR"; message: string };

/** ผู้ให้บริการตรวจสลิปกับธนาคาร (เช่น EasySlip) — ส่งแค่ข้อความใน QR ไม่ส่งรูป */
export interface SlipProvider {
  name: string;
  verify(payload: string): Promise<SlipProviderResult>;
}

/** บัญชีรับเงินของผู้ให้บริการ — ใช้เทียบกับผู้รับเงินบนสลิป */
export interface PayeeAccounts {
  accountNo: string | null;
  promptPayId: string | null;
  accountName: string | null;
}

export type SlipCheckStatus = "SKIPPED" | "VERIFIED" | "NOT_FOUND" | "PENDING" | "ERROR";

/** ผลตรวจสลิป — เก็บไว้กับใบแจ้งหนี้ให้ผู้ตรวจเห็น */
export interface SlipCheck {
  checkedAt: string;
  qrFound: boolean;
  transRef: string | null;
  sendingBank: string | null;
  provider: string | null;
  providerStatus: SlipCheckStatus;
  providerMessage: string | null;
  amount: number | null;
  amountOk: boolean | null;
  receiver: string | null;
  receiverOk: boolean | null;
  sender: string | null;
  transferredAt: string | null;
  dateOk: boolean | null;
  /** PASS = ผ่านทุกข้อ อนุมัติอัตโนมัติได้ · REVIEW = ให้คนตรวจ */
  verdict: "PASS" | "REVIEW";
  reasons: string[];
  autoApproved?: boolean;
}

export interface BillingMailer {
  send(to: string, subject: string, text: string, html: string): Promise<void>;
}

export interface DeviceRepository {
  list(): Promise<
    {
      id: string;
      name: string;
      createdAt: Date;
      lastSeenAt: Date | null;
      createdBy: string;
      /** มีเครื่องผูกอยู่แล้ว */
      hasDevice: boolean;
      staff: { id: string; username: string; fullName: string; isActive: boolean }[];
    }[]
  >;
  activeCount(): Promise<number>;
  /** tokenHash = null → สร้างจุดไว้ก่อน ยังไม่มีเครื่อง */
  register(name: string, tokenHash: string | null, by: string): Promise<string>;
  /** ผูกเครื่องใหม่กับจุดที่ใช้งานอยู่ (เครื่องเดิมของจุดนี้หลุด) — false = ไม่พบจุด */
  claim(id: string, tokenHash: string): Promise<boolean>;
  /** ยกเลิกจุด + ปลดเจ้าหน้าที่ประจำจุด */
  revoke(id: string, at: Date): Promise<boolean>;
  /** อุปกรณ์จาก hash ของ token — พร้อมลำดับในบรรดาอุปกรณ์ที่ใช้งานอยู่ (0 = เก่าสุด) */
  findActive(tokenHash: string): Promise<{ id: string; name: string; rank: number } | null>;
  touch(id: string, at: Date): Promise<void>;
}
