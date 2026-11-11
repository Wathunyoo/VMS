import type { Metadata } from "next";
import { guestPass } from "@/application/guest-invite/guest-invite.usecase";
import { residentInviteDeps } from "@/container";
import { GuestPassCard } from "@/features/guest-invite/components/guest-pass-card";
import { appUrl } from "@/lib/app-url";
import { APP_NAME, BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "QR สำหรับแขก",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function GuestPassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await guestPass(token, residentInviteDeps());

  return (
    <main className="mx-auto min-h-dvh max-w-sm space-y-4 p-4 pt-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BRAND.wordmark} alt={APP_NAME} width={876} height={214} className="h-6 w-auto" />
      {view ? (
        <GuestPassCard view={view} qrValue={`${appUrl()}/g/${token}`} />
      ) : (
        <p className="rounded-lg border p-6 text-center text-muted-foreground">ไม่พบ QR นี้ — ลิงก์อาจไม่ถูกต้อง หรือถูกลบไปแล้ว</p>
      )}
    </main>
  );
}
