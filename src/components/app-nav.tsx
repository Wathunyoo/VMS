"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, DatabaseBackup, House, KeyRound, LogIn, LogOut, Settings, UserCircle } from "lucide-react";
import { logoutAction } from "@/features/auth/actions";
import { cn } from "@/lib/utils";
import { APP_NAME, BRAND } from "@/lib/brand";

// operator = หน้างานของจุด รปภ. (องค์กรผู้ให้บริการไม่มี) · platform = เฉพาะผู้ดูแลองค์กรผู้ให้บริการ
const LINKS = [
  { href: "/home", label: "เมนูหลัก", icon: House, admin: false, operator: true, platform: false, match: ["/home"] },
  { href: "/check-in", label: "Check-in", icon: LogIn, admin: false, operator: true, platform: false, match: ["/check-in", "/pass"] },
  { href: "/check-out", label: "Check-out", icon: LogOut, admin: false, operator: true, platform: false, match: ["/check-out"] },
  { href: "/reports", label: "รายงาน", icon: BarChart3, admin: false, operator: true, platform: false, match: ["/reports"] },
  { href: "/platform/customers", label: "ลูกค้า", icon: Building2, admin: true, operator: false, platform: true, match: ["/platform/customers"] },
  { href: "/platform/backups", label: "สำรองข้อมูล", icon: DatabaseBackup, admin: true, operator: false, platform: true, match: ["/platform/backups"] },
  { href: "/admin", label: "ตั้งค่า", icon: Settings, admin: true, operator: false, platform: false, match: ["/admin"] },
];

interface Props {
  user: { fullName: string; role: "ADMIN" | "STAFF"; orgName: string; trialDaysLeft: number | null; isPlatformAdmin: boolean; isPlatformOrg: boolean; renewalsDue?: number } | null;
}

export function AppNav({ user }: Props) {
  const pathname = usePathname();
  return (
    <nav className="no-print sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2 md:px-8">
        <span className="mr-2 flex min-w-0 flex-col leading-tight sm:mr-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.wordmark} alt={APP_NAME} width={876} height={214} className="h-5 w-auto" />
          {user && <span className="max-w-40 truncate text-[10px] text-muted-foreground">{user.orgName}</span>}
        </span>
        {LINKS.filter((l) => (!l.admin || user?.role === "ADMIN") && (!l.platform || user?.isPlatformAdmin) && (!l.operator || !user?.isPlatformOrg)).map(({ href, label, icon: Icon, match }) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-accent sm:px-3",
              match.some((m) => pathname.startsWith(m)) && "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <Icon className="size-4" /> <span className={user?.isPlatformAdmin ? "hidden xl:inline" : "hidden sm:inline"}>{label}</span>
            {href === "/platform/customers" && !!user?.renewalsDue && (
              <span title={`ต้องติดต่อต่อสัญญา ${user.renewalsDue} ราย`} className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-4 text-white">
                {user.renewalsDue}
              </span>
            )}
          </Link>
        ))}
        {user && (
          <div className="ml-auto flex items-center gap-1">
            {user.trialDaysLeft != null && (
              <span className="mr-2 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
                ทดลองใช้ · เหลือ {user.trialDaysLeft} วัน
              </span>
            )}
            <span className="hidden items-center gap-1.5 text-sm text-muted-foreground md:flex">
              <UserCircle className="size-4" /> {user.fullName}
            </span>
            <Link href="/account/password" className="rounded-md p-2 hover:bg-accent" title="เปลี่ยนรหัสผ่าน">
              <KeyRound className="size-4" />
            </Link>
            <form action={logoutAction}>
              <button type="submit" aria-label="ออกจากระบบ" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent sm:px-3">
                <LogOut className="size-4" /> <span className="hidden sm:inline">ออกจากระบบ</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </nav>
  );
}
