import type { InvoiceRecord } from "@/application/billing/billing.types";
import type { Access } from "@/domain/billing/access";
import type { BillingPeriod } from "@/domain/billing/pricing";

export interface InvoiceView {
  id: string;
  number: string;
  status: "PENDING_PAYMENT" | "PENDING_REVIEW" | "PAID" | "REJECTED" | "CANCELLED";
  points: number;
  period: BillingPeriod;
  subtotal: number;
  vat: number;
  withholding: number;
  netPayable: number;
  createdText: string;
  coverText: string | null;
  receiptNumber: string | null;
  reviewNote: string | null;
}

const dt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });

export const ACCESS_LABEL: Record<Access["state"], string> = {
  TRIAL: "ทดลองใช้",
  TRIAL_ENDED: "หมดช่วงทดลองใช้",
  ACTIVE: "ใช้งานอยู่",
  GRACE: "เกินกำหนดชำระ (ช่วงผ่อนผัน)",
  EXPIRED: "หมดอายุ",
  UNLIMITED: "ใช้งานตามสัญญา",
  SUSPENDED: "ถูกระงับ",
  PENDING: "รอยืนยันอีเมล",
};

export function toInvoiceView(i: InvoiceRecord): InvoiceView {
  return {
    id: i.id,
    number: i.number,
    status: i.status,
    points: i.points,
    period: i.period,
    subtotal: i.subtotal,
    vat: i.vat,
    withholding: i.withholding,
    netPayable: i.netPayable,
    createdText: dt.format(i.createdAt),
    coverText: i.coverFrom && i.coverUntil ? `${dt.format(i.coverFrom)} – ${dt.format(i.coverUntil)}` : null,
    receiptNumber: i.receiptNumber,
    reviewNote: i.reviewNote,
  };
}

export const formatDate = (d: Date | null) => (d ? dt.format(d) : null);
