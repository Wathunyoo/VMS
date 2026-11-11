import Link from "next/link";
import { BarChart3, LogIn, LogOut, QrCode, Settings } from "lucide-react";
import { StationNotice } from "@/features/billing/components/station-notice";
import { kioskSummary } from "@/features/home/summary";
import { requireOperator } from "@/infrastructure/auth/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** เมนูหลักของจุด รปภ. — ปุ่มใหญ่ให้เลือกรายการที่จะทำ (แตะง่ายบนแท็บเล็ต) */
export default async function HomePage() {
  const staff = await requireOperator();
  const s = await kioskSummary(staff.organizationId);

  const main = [
    {
      href: "/check-in",
      label: "Check-in",
      sub: "ลงทะเบียนผู้มาติดต่อ",
      icon: LogIn,
      tone: "bg-emerald-600 hover:bg-emerald-700 text-white",
    },
    {
      href: "/check-out",
      label: "Check-out",
      sub: "ผู้มาติดต่อออกจากพื้นที่",
      icon: LogOut,
      tone: "bg-sky-700 hover:bg-sky-800 text-white",
      badge: s.inside ? `อยู่ในพื้นที่ ${s.inside} คน` : null,
    },
  ];
  const more = [
    {
      href: "/check-in?scan=1",
      label: "สแกน QR แขก",
      sub: "แขกที่ลูกบ้านแจ้งล่วงหน้า",
      icon: QrCode,
      badge: s.invites ? `วันนี้ ${s.invites} ราย` : null,
    },
    { href: "/reports", label: "รายงาน", sub: `เข้าวันนี้ ${s.today} คน`, icon: BarChart3, badge: null },
    ...(staff.role === "ADMIN" ? [{ href: "/admin", label: "ตั้งค่า", sub: "รายชื่อ แบบฟอร์ม เจ้าหน้าที่", icon: Settings, badge: null }] : []),
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">เลือกรายการ</h1>
        <p className="text-sm text-muted-foreground">
          {staff.orgName} · {staff.fullName}
        </p>
      </header>

      <StationNotice staff={staff} purpose="CHECK_IN" />

      <div className="grid gap-4 sm:grid-cols-2">
        {main.map(({ href, label, sub, icon: Icon, tone, badge }) => (
          <Link
            key={href}
            href={href}
            className={cn("relative flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl p-6 text-center shadow-sm transition-colors", tone)}
          >
            <Icon className="size-16" strokeWidth={1.75} />
            <span className="text-3xl font-bold">{label}</span>
            <span className="text-base opacity-90">{sub}</span>
            {badge && <span className="absolute right-4 top-4 rounded-full bg-white/20 px-3 py-1 text-sm font-medium">{badge}</span>}
          </Link>
        ))}
      </div>

      <div className={cn("grid gap-4", more.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {more.map(({ href, label, sub, icon: Icon, badge }) => (
          <Link key={href} href={href} className="relative flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm hover:bg-accent">
            <Icon className="size-9 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block text-lg font-semibold">{label}</span>
              <span className="block text-sm text-muted-foreground">{sub}</span>
            </span>
            {badge && <span className="ml-auto shrink-0 rounded-full bg-village/15 px-2.5 py-0.5 text-xs font-semibold text-village">{badge}</span>}
          </Link>
        ))}
      </div>
    </main>
  );
}
