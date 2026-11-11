import { CheckInForm } from "@/features/check-in/components/check-in-form";
import { getCheckInDirectory } from "@/infrastructure/repositories/prisma-directory.repository";
import { SITE_MODES, type SiteMode } from "@/domain/visit/types";
import { formSettingsDeps, staffInviteDeps } from "@/container";
import { listInvitesForCheckIn } from "@/application/guest-invite/guest-invite.usecase";
import { requireOperator } from "@/infrastructure/auth/session";
import { StationNotice } from "@/features/billing/components/station-notice";

export const dynamic = "force-dynamic";

export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ mode?: string; scan?: string }> }) {
  const staff = await requireOperator();
  const formRepo = formSettingsDeps(staff.organizationId).repo;
  const [{ mode, scan }, sites, config, customFields, invites] = await Promise.all([
    searchParams,
    getCheckInDirectory(staff.organizationId),
    formRepo.config(),
    formRepo.customFields(false),
    listInvitesForCheckIn(staffInviteDeps(staff.organizationId)),
  ]);
  // ไม่ระบุโหมด → ใช้โหมดของสถานที่ที่องค์กรมี (องค์กรที่มีแต่โรงงาน/หมู่บ้าน เปิดโหมดนั้น)
  const requested = mode?.toUpperCase() as SiteMode | undefined;
  const available = SITE_MODES.filter((m) => sites.some((s) => s.mode === m));
  const defaultMode: SiteMode = requested && available.includes(requested) ? requested : (available[0] ?? "OFFICE");

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">ลงทะเบียนผู้ติดต่อ (Check-in)</h1>
        <p className="text-sm text-muted-foreground">บันทึกข้อมูล ถ่ายภาพ และออกบัตรผ่าน</p>
      </header>
      <StationNotice staff={staff} purpose="CHECK_IN" />
      <CheckInForm sites={sites} defaultMode={defaultMode} form={{ ...config, customFields }} invites={invites} autoScan={scan === "1"} />
    </main>
  );
}
