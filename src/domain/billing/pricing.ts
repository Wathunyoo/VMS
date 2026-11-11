/**
 * ราคาและการคำนวณเงิน — แก้ราคาจริงที่ไฟล์นี้ไฟล์เดียว
 * ⚠️ ราคาตอนนี้เป็น "ตัวอย่าง" — กำหนดราคาจริงก่อนเปิดขาย
 */
export const PRICING = {
  /** ราคาต่อจุด Check-in ต่อเดือน (ยังไม่รวม VAT) — ตัวอย่าง */
  pricePerPointMonthly: 490,
  /** รายปีจ่ายเท่ากับกี่เดือน (10 = แถม 2 เดือน) */
  yearlyMonthsCharged: 10,
  vatRate: 0.07,
  /** หัก ณ ที่จ่าย ค่าบริการ (นิติบุคคลผู้จ่าย) */
  withholdingRate: 0.03,
  minPoints: 1,
  maxPoints: 50,
  /** จำนวนจุดระหว่างทดลองใช้ */
  trialPointLimit: 2,
  /** ผ่อนผันหลังหมดรอบที่ชำระ (Check-in ยังได้ + แถบเตือน) */
  graceDays: 7,
  isExample: true,
} as const;

export type BillingPeriod = "MONTHLY" | "YEARLY";

export interface Quote {
  points: number;
  period: BillingPeriod;
  /** จำนวนเดือนที่ได้ใช้ */
  months: number;
  unitPrice: number;
  subtotal: number;
  vat: number;
  total: number;
  withholding: number;
  netPayable: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function quote(points: number, period: BillingPeriod, withholdingTax: boolean): Quote {
  if (!Number.isInteger(points) || points < PRICING.minPoints || points > PRICING.maxPoints) {
    throw new RangeError(`จำนวนจุดต้องอยู่ระหว่าง ${PRICING.minPoints}–${PRICING.maxPoints}`);
  }
  const months = period === "YEARLY" ? 12 : 1;
  const chargedMonths = period === "YEARLY" ? PRICING.yearlyMonthsCharged : 1;
  const unitPrice = PRICING.pricePerPointMonthly;
  const subtotal = round2(points * unitPrice * chargedMonths);
  const vat = round2(subtotal * PRICING.vatRate);
  const total = round2(subtotal + vat);
  // หัก ณ ที่จ่ายคำนวณจากยอดก่อน VAT
  const withholding = withholdingTax ? round2(subtotal * PRICING.withholdingRate) : 0;
  return { points, period, months, unitPrice, subtotal, vat, total, withholding, netPayable: round2(total - withholding) };
}

export function formatBaht(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
