import { AppNav } from "@/components/app-nav";
import { computeAccess } from "@/domain/billing/access";
import { CONTRACT_NOTICE_DAYS, contractDateFromYmd, contractYmd } from "@/domain/org/contract";
import { prismaCustomersRepository } from "@/infrastructure/repositories/prisma-customers.repository";
import { getCurrentUser, isPlatformOrg } from "@/infrastructure/auth/session";
import { isPlatformAdmin } from "@/infrastructure/auth/station";
import { prismaBillingRepository } from "@/infrastructure/repositories/prisma-billing.repository";

export default async function KioskLayout({ children }: { children: React.ReactNode }) {
  // แต่ละหน้าเรียก requireStaff() เองเพื่อบังคับ login — layout ใช้แสดงชื่อผู้ใช้และสถานะบริการ
  const user = await getCurrentUser();
  const access = user ? computeAccess(await prismaBillingRepository(user.organizationId).org(), new Date()) : null;
  const severe = access && !access.canCheckIn;
  const platform = !!user && isPlatformAdmin(user);
  // ผู้ให้บริการ: จำนวนลูกค้าที่สัญญาหมดแล้ว/ใกล้หมด (แสดงบนเมนู "ลูกค้า")
  let renewalsDue = 0;
  if (platform) {
    const until = contractDateFromYmd(contractYmd(new Date(Date.now() + CONTRACT_NOTICE_DAYS * 86_400_000)))!;
    renewalsDue = await prismaCustomersRepository.renewalsDue(until, user.orgSlug);
  }

  return (
    <>
      <AppNav
        user={
          user && {
            fullName: user.fullName,
            role: user.role,
            orgName: user.orgName,
            trialDaysLeft: user.trialDaysLeft,
            isPlatformAdmin: platform,
            isPlatformOrg: isPlatformOrg(user),
            renewalsDue,
          }
        }
      />
      {access?.message && (
        <div
          role="status"
          className={`no-print flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-sm ${severe ? "bg-destructive text-white" : "bg-amber-100 text-amber-900"}`}
        >
          <span>{access.message}</span>
          {user?.role === "ADMIN" && <span className="font-semibold">ติดต่อผู้ให้บริการเพื่อต่อสัญญา</span>}
        </div>
      )}
      {children}
    </>
  );
}
