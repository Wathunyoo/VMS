import type { Metadata } from "next";
import { Stamp } from "lucide-react";
import { getStampRequest } from "@/application/stamp/stamp.usecase";
import { stampDeps } from "@/container";
import { StampDecision } from "@/features/stamp/components/stamp-decision";
import { APP_NAME, BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

// ลิงก์มี token ส่วนตัว — ห้าม index และห้ามส่ง URL ไปกับ Referer
export const metadata: Metadata = {
  title: "อนุมัติผู้ติดต่อ (E-Stamp)",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function StampPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getStampRequest(token, stampDeps);

  return (
    <main className="mx-auto min-h-dvh max-w-md space-y-4 p-4 pt-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BRAND.wordmark} alt={APP_NAME} width={876} height={214} className="h-6 w-auto" />
      <header className="flex items-center gap-2">
        <Stamp className="size-6" />
        <div>
          <h1 className="text-lg font-bold leading-tight">อนุมัติผู้ติดต่อ (E-Stamp)</h1>
          <p className="text-xs text-muted-foreground">ยืนยันว่าผู้ติดต่อมาพบคุณจริง ก่อนออกจากอาคาร</p>
        </div>
      </header>
      {view ? (
        <StampDecision token={token} initial={view} />
      ) : (
        <p className="rounded-lg border p-6 text-center text-muted-foreground">ไม่พบรายการ — ลิงก์อาจไม่ถูกต้อง</p>
      )}
    </main>
  );
}
