import Link from "next/link";
import { platformDeps } from "@/container";
import { formatBaht } from "@/domain/billing/pricing";
import type { SlipCheck } from "@/application/billing/billing.types";
import { SlipReview, type CheckView } from "@/features/platform/components/slip-review";
import { requirePlatformAdmin } from "@/infrastructure/auth/station";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });
const STATUS: Record<string, string> = { PAID: "ชำระแล้ว", REJECTED: "ไม่ผ่าน", PENDING_PAYMENT: "รอชำระ", CANCELLED: "ยกเลิก" };

const PROVIDER_STATUS: Record<SlipCheck["providerStatus"], string> = {
  SKIPPED: "ตรวจในเครื่อง (ยังไม่ได้เชื่อมธนาคาร)",
  VERIFIED: "ธนาคารยืนยันรายการ",
  NOT_FOUND: "ธนาคารไม่พบรายการ",
  PENDING: "ธนาคารยังไม่ยืนยัน",
  ERROR: "เชื่อมต่อไม่สำเร็จ",
};

function toCheckView(c: SlipCheck | null): CheckView | null {
  if (!c) return null;
  return {
    verdict: c.verdict,
    checkedText: fmt.format(new Date(c.checkedAt)),
    provider: c.provider,
    providerLabel: [c.provider, PROVIDER_STATUS[c.providerStatus]].filter(Boolean).join(" · "),
    transRef: c.transRef,
    sendingBank: c.sendingBank,
    amount: c.amount === null ? null : formatBaht(c.amount),
    amountOk: c.amountOk,
    receiver: c.receiver,
    receiverOk: c.receiverOk,
    sender: c.sender,
    transferredText: c.transferredAt ? fmt.format(new Date(c.transferredAt)) : null,
    dateOk: c.dateOk,
    reasons: c.reasons,
    canRecheck: !!c.provider && c.qrFound && c.providerStatus !== "VERIFIED",
  };
}

export default async function PlatformBillingPage() {
  await requirePlatformAdmin();
  const repo = platformDeps().repo;
  const [pending, recent] = await Promise.all([repo.pendingReview(), repo.recent(30)]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">ตรวจสลิปโอนเงิน</h1>
        <p className="text-sm text-muted-foreground">สำหรับผู้ให้บริการ · อนุมัติแล้วระบบต่ออายุ ปรับจำนวนจุด ออกใบเสร็จ และส่งอีเมลให้ลูกค้า</p>
      </header>
      <SlipReview
        items={pending.map((i) => ({
          id: i.id,
          number: i.number,
          orgName: i.orgName,
          orgSlug: i.orgSlug,
          points: i.points,
          periodLabel: i.period === "YEARLY" ? "รายปี" : "รายเดือน",
          netPayable: formatBaht(i.netPayable),
          withholding: i.withholding > 0,
          uploadedText: i.slipUploadedAt ? fmt.format(i.slipUploadedAt) : "—",
          transferredText: i.transferredAt ? fmt.format(i.transferredAt) : null,
          isPdf: !!i.slipPath?.endsWith(".pdf"),
          check: toCheckView(i.slipCheck),
        }))}
      />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">ล่าสุด</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="p-3">เลขที่</th>
                <th className="p-3">องค์กร</th>
                <th className="p-3 text-right">ยอด</th>
                <th className="p-3">สถานะ</th>
                <th className="p-3">ใบเสร็จ</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="p-3 font-mono">
                    <Link href={`/billing/invoices/${i.id}`} target="_blank" className="underline">
                      {i.number}
                    </Link>
                  </td>
                  <td className="p-3">{i.orgName}</td>
                  <td className="p-3 text-right">{formatBaht(i.netPayable)}</td>
                  <td className="p-3">
                    {STATUS[i.status] ?? i.status}
                    {i.slipCheck?.autoApproved && <span className="ml-1 text-xs text-muted-foreground">(อัตโนมัติ)</span>}
                  </td>
                  <td className="p-3 font-mono">{i.receiptNumber ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
