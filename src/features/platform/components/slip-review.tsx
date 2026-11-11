"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { approveInvoiceAction, recheckSlipAction, rejectInvoiceAction } from "../actions";

export interface PendingView {
  id: string;
  number: string;
  orgName: string;
  orgSlug: string;
  points: number;
  periodLabel: string;
  netPayable: string;
  withholding: boolean;
  uploadedText: string;
  transferredText: string | null;
  isPdf: boolean;
  check: CheckView | null;
}

export interface CheckView {
  verdict: "PASS" | "REVIEW";
  checkedText: string;
  provider: string | null;
  providerLabel: string;
  transRef: string | null;
  sendingBank: string | null;
  amount: string | null;
  amountOk: boolean | null;
  receiver: string | null;
  receiverOk: boolean | null;
  sender: string | null;
  transferredText: string | null;
  dateOk: boolean | null;
  reasons: string[];
  canRecheck: boolean;
}

function Mark({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="text-muted-foreground">—</span>;
  return ok ? (
    <CheckCircle2 aria-label="ตรง" className="inline size-4 text-green-700" />
  ) : (
    <XCircle aria-label="ไม่ตรง" className="inline size-4 text-destructive" />
  );
}

function SlipCheckPanel({ c, onRecheck, pending }: { c: CheckView; onRecheck: () => void; pending: boolean }) {
  return (
    <div className={`space-y-2 rounded-lg border p-3 text-sm ${c.verdict === "PASS" ? "border-green-600/40 bg-green-50" : "border-amber-400/60 bg-amber-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold">
          {c.verdict === "PASS" ? <ShieldCheck className="size-4 text-green-700" /> : <AlertTriangle className="size-4 text-amber-700" />}
          {c.verdict === "PASS" ? "ตรวจกับธนาคารแล้ว ผ่านทุกข้อ" : "ตรวจอัตโนมัติ — ต้องให้คนตรวจ"}
        </p>
        <span className="text-xs text-muted-foreground">
          {c.providerLabel} · {c.checkedText}
        </span>
      </div>
      <dl className="grid grid-cols-[120px_1fr_auto] gap-x-2 gap-y-1">
        <dt className="text-muted-foreground">ยอดโอน</dt>
        <dd>{c.amount ? `฿${c.amount}` : "—"}</dd>
        <dd><Mark ok={c.amountOk} /></dd>
        <dt className="text-muted-foreground">ผู้รับเงิน</dt>
        <dd className="break-words">{c.receiver ?? "—"}</dd>
        <dd><Mark ok={c.receiverOk} /></dd>
        <dt className="text-muted-foreground">เวลาโอน</dt>
        <dd>{c.transferredText ?? "—"}</dd>
        <dd><Mark ok={c.dateOk} /></dd>
        <dt className="text-muted-foreground">ผู้โอน</dt>
        <dd className="col-span-2">{c.sender ?? c.sendingBank ?? "—"}</dd>
        <dt className="text-muted-foreground">เลขอ้างอิง</dt>
        <dd className="col-span-2 break-all font-mono text-xs">{c.transRef ?? "ไม่พบ QR"}</dd>
      </dl>
      {c.reasons.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-amber-900">
          {c.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {c.canRecheck && (
        <Button size="sm" variant="outline" disabled={pending} onClick={onRecheck}>
          <RefreshCw /> ตรวจกับธนาคารอีกครั้ง
        </Button>
      )}
    </div>
  );
}

export function SlipReview({ items }: { items: PendingView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "เกิดข้อผิดพลาด");
      router.refresh();
    });
  };

  if (items.length === 0) return <p className="rounded-lg border p-8 text-center text-muted-foreground">ไม่มีสลิปรอตรวจ</p>;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      {items.map((i) => (
        <Card key={i.id}>
          <CardContent className="grid gap-5 pt-6 md:grid-cols-[260px_1fr]">
            <a href={`/billing/slips/${i.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border bg-muted">
              {i.isPdf ? (
                <span className="flex h-64 items-center justify-center text-sm underline">เปิดสลิป (PDF)</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/billing/slips/${i.id}`} alt={`สลิป ${i.number}`} className="h-64 w-full object-contain" />
              )}
            </a>
            <div className="space-y-3">
              <div>
                <p className="text-lg font-semibold">{i.orgName}</p>
                <p className="text-sm text-muted-foreground">
                  รหัส {i.orgSlug} ·{" "}
                  <Link href={`/billing/invoices/${i.id}`} target="_blank" className="underline">
                    {i.number}
                  </Link>
                </p>
              </div>
              <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
                <dt className="text-muted-foreground">ยอดที่ต้องได้รับ</dt>
                <dd className="text-lg font-bold">฿{i.netPayable}</dd>
                <dt className="text-muted-foreground">รายการ</dt>
                <dd>
                  {i.points} จุด · {i.periodLabel}
                  {i.withholding && " · หัก ณ ที่จ่าย 3% (รอ 50 ทวิ)"}
                </dd>
                <dt className="text-muted-foreground">เวลาโอน (ลูกค้าระบุ)</dt>
                <dd>{i.transferredText ?? "—"}</dd>
                <dt className="text-muted-foreground">แนบสลิปเมื่อ</dt>
                <dd>{i.uploadedText}</dd>
              </dl>
              {i.check && <SlipCheckPanel c={i.check} pending={pending} onRecheck={() => act(() => recheckSlipAction(i.id))} />}
              {i.check?.verdict !== "PASS" && (
                <p className="text-xs text-muted-foreground">ตรวจยอดเงินและเวลาในบัญชีธนาคารให้ตรงกับสลิปก่อนอนุมัติ</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={pending} onClick={() => confirm(`ยืนยันได้รับเงิน ฿${i.netPayable} จาก ${i.orgName}?`) && act(() => approveInvoiceAction(i.id))}>
                  {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} อนุมัติ · ออกใบเสร็จ
                </Button>
                <Input
                  aria-label="เหตุผลที่ไม่ผ่าน"
                  className="max-w-64"
                  placeholder="เหตุผล เช่น ยอดไม่ตรง"
                  value={reasons[i.id] ?? ""}
                  onChange={(e) => setReasons({ ...reasons, [i.id]: e.target.value })}
                />
                <Button variant="outline" disabled={pending || (reasons[i.id] ?? "").trim().length < 3} onClick={() => act(() => rejectInvoiceAction(i.id, reasons[i.id] ?? ""))}>
                  <XCircle /> ไม่ผ่าน
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
