import type { Metadata } from "next";
import { CalendarPlus } from "lucide-react";
import { InviteError, residentPage } from "@/application/guest-invite/guest-invite.usecase";
import { residentInviteDeps } from "@/container";
import { ResidentInvites } from "@/features/guest-invite/components/resident-invites";
import { APP_NAME, BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

// ลิงก์ส่วนตัวของลูกบ้าน (ส่งทาง LINE) — ห้าม index และห้ามส่ง URL ไปกับ Referer
export const metadata: Metadata = {
  title: "แจ้งแขกล่วงหน้า",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResidentInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let view: Awaited<ReturnType<typeof residentPage>> | null = null;
  let error: string | null = null;
  try {
    view = await residentPage(decodeURIComponent(token), residentInviteDeps());
  } catch (e) {
    if (!(e instanceof InviteError)) throw e;
    error = e.message;
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md space-y-4 p-4 pt-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BRAND.wordmark} alt={APP_NAME} width={876} height={214} className="h-6 w-auto" />
      <header className="flex items-center gap-2">
        <CalendarPlus className="size-6 text-village" />
        <div>
          <h1 className="text-lg font-bold leading-tight">แจ้งแขกล่วงหน้า</h1>
          {view ? (
            <p className="text-xs text-muted-foreground">
              {view.placeText} · คุณ{view.hostName}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">สร้าง QR ให้แขกแสดงที่ป้อม รปภ.</p>
          )}
        </div>
      </header>
      {view ? (
        <ResidentInvites token={decodeURIComponent(token)} initial={view} />
      ) : (
        <p className="rounded-lg border p-6 text-center text-muted-foreground">{error}</p>
      )}
    </main>
  );
}
