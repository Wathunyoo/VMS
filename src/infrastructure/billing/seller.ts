import "server-only";

/** ข้อมูลผู้ให้บริการ (ผู้ขาย) และบัญชีรับเงิน — ตั้งใน .env */
export function sellerInfo() {
  const e = (k: string, fallback: string) => process.env[k]?.trim() || fallback;
  return {
    name: e("SELLER_NAME", "[ชื่อบริษัทผู้ให้บริการ]"),
    taxId: e("SELLER_TAX_ID", "[เลขประจำตัวผู้เสียภาษี]"),
    branch: e("SELLER_BRANCH", "สำนักงานใหญ่"),
    address: e("SELLER_ADDRESS", "[ที่อยู่ผู้ให้บริการ]"),
    bankName: e("BANK_NAME", "[ธนาคาร]"),
    bankAccountName: e("BANK_ACCOUNT_NAME", "[ชื่อบัญชี]"),
    bankAccountNo: e("BANK_ACCOUNT_NO", "[เลขที่บัญชี]"),
    promptPayId: process.env.PROMPTPAY_ID?.trim() || null,
    configured: !!process.env.SELLER_NAME && !!process.env.BANK_ACCOUNT_NO,
  };
}

/** องค์กรของผู้ให้บริการ — ผู้ดูแลขององค์กรนี้ตรวจสลิปของลูกค้าได้ */
export const platformOrgSlug = () => process.env.PLATFORM_ORG_SLUG?.trim() || "main";
export const platformBillingEmail = () => process.env.PLATFORM_BILLING_EMAIL?.trim() || null;

/** บัญชีรับเงิน (ตัวเลขล้วน) ใช้เทียบกับผู้รับเงินบนสลิป */
export function payeeAccounts() {
  const digits = (k: string) => process.env[k]?.replace(/\D/g, "") || null;
  return {
    accountNo: digits("BANK_ACCOUNT_NO"),
    promptPayId: digits("PROMPTPAY_ID"),
    accountName: process.env.BANK_ACCOUNT_NAME?.trim() || null,
  };
}
