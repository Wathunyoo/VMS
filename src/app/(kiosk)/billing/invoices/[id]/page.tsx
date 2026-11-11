import { notFound } from "next/navigation";
import { formatBaht, PRICING } from "@/domain/billing/pricing";
import { PrintButton } from "@/features/billing/components/print-button";
import { loadInvoiceFor } from "@/features/billing/load-invoice";
import { formatDate } from "@/features/billing/view";
import { sellerInfo } from "@/infrastructure/billing/seller";
import { requireStaff } from "@/infrastructure/auth/session";
import { APP_NAME, APP_TAGLINE, BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function InvoiceDocPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const inv = await loadInvoiceFor(user, (await params).id);
  if (!inv) notFound();
  const seller = sellerInfo();
  const paid = inv.status === "PAID";
  const chargedMonths = inv.period === "YEARLY" ? PRICING.yearlyMonthsCharged : 1;

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-8">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton />
      </div>
      <article className="print-area space-y-6 bg-white p-8 text-sm text-black shadow-sm">
        <header className="flex flex-wrap justify-between gap-4 border-b pb-4">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.wordmark} alt={APP_NAME} width={876} height={214} className="mb-2 h-8 w-auto" />
            <p className="text-lg font-bold">{seller.name}</p>
            <p className="whitespace-pre-line">{seller.address}</p>
            <p>
              เลขประจำตัวผู้เสียภาษี {seller.taxId} ({seller.branch})
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold">{paid ? "ใบเสร็จรับเงิน / ใบกำกับภาษี" : "ใบแจ้งหนี้"}</p>
            <p>เลขที่ {paid ? inv.receiptNumber : inv.number}</p>
            <p>วันที่ {formatDate(paid ? inv.paidAt : inv.createdAt)}</p>
            {paid && <p className="text-xs">อ้างอิงใบแจ้งหนี้ {inv.number}</p>}
            {inv.status === "CANCELLED" && <p className="font-bold text-red-700">ยกเลิกแล้ว</p>}
          </div>
        </header>

        <section>
          <p className="font-semibold">ผู้ซื้อ</p>
          <p>
            {inv.buyer.legalName} ({inv.buyer.branch})
          </p>
          <p className="whitespace-pre-line">{inv.buyer.address}</p>
          <p>เลขประจำตัวผู้เสียภาษี {inv.buyer.taxId}</p>
        </section>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y text-left">
              <th className="py-2">รายการ</th>
              <th className="py-2 text-right">จำนวน</th>
              <th className="py-2 text-right">ราคาต่อหน่วย</th>
              <th className="py-2 text-right">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b align-top">
              <td className="py-2">
                ค่าบริการ{APP_TAGLINE} ({APP_NAME}) — {inv.points} จุด Check-in
                <br />
                <span className="text-xs">
                  {inv.period === "YEARLY" ? `รายปี ใช้งาน 12 เดือน (ชำระ ${chargedMonths} เดือน)` : "รายเดือน"}
                  {inv.coverFrom && inv.coverUntil && ` · ${formatDate(inv.coverFrom)} – ${formatDate(inv.coverUntil)}`}
                </span>
              </td>
              <td className="py-2 text-right">
                {inv.points} × {chargedMonths} เดือน
              </td>
              <td className="py-2 text-right">{formatBaht(inv.unitPrice)}</td>
              <td className="py-2 text-right">{formatBaht(inv.subtotal)}</td>
            </tr>
          </tbody>
        </table>

        <dl className="ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-y-1">
          <dt>มูลค่าก่อนภาษี</dt>
          <dd className="text-right">{formatBaht(inv.subtotal)}</dd>
          <dt>ภาษีมูลค่าเพิ่ม 7%</dt>
          <dd className="text-right">{formatBaht(inv.vat)}</dd>
          <dt className="font-semibold">รวมทั้งสิ้น</dt>
          <dd className="text-right font-semibold">{formatBaht(inv.total)}</dd>
          {inv.withholding > 0 && (
            <>
              <dt>หัก ณ ที่จ่าย 3%</dt>
              <dd className="text-right">−{formatBaht(inv.withholding)}</dd>
              <dt className="font-semibold">{paid ? "รับชำระสุทธิ" : "ยอดที่ต้องชำระ"}</dt>
              <dd className="text-right font-semibold">{formatBaht(inv.netPayable)}</dd>
            </>
          )}
        </dl>

        {!paid && inv.status !== "CANCELLED" && (
          <section className="rounded border p-3">
            <p className="font-semibold">ชำระโดยโอนเข้าบัญชี</p>
            <p>
              {seller.bankName} · {seller.bankAccountName} · เลขที่ {seller.bankAccountNo}
            </p>
            <p className="text-xs">หลังโอนแล้ว แนบสลิปที่เมนู “ค่าบริการ” ในระบบ</p>
          </section>
        )}
        <p className="text-xs text-gray-600">เอกสารนี้จัดทำโดยระบบคอมพิวเตอร์</p>
      </article>
    </main>
  );
}
