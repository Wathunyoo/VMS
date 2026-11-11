import Link from "next/link";
import { adminTabsFor } from "@/components/admin-tabs-data";
import { isPlatformOrg, requireAdmin } from "@/infrastructure/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const admin = await requireAdmin();
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">ตั้งค่า</h1>
        <p className="text-sm text-muted-foreground">จัดการข้อมูลและการตั้งค่าขององค์กร</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {adminTabsFor(isPlatformOrg(admin)).map(({ href, label, desc, icon: Icon }) => (
          <Link key={href} href={href} className="flex gap-3 rounded-xl border bg-card p-4 hover:bg-accent">
            <Icon className="size-6 shrink-0" />
            <span>
              <span className="block font-semibold">{label}</span>
              <span className="text-sm text-muted-foreground">{desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
