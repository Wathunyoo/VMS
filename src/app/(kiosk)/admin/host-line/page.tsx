import { listHostsForLine } from "@/application/host-line/host-line.usecase";
import { hostLineDeps } from "@/container";
import { HostLineAdmin } from "@/features/host-line/components/host-line-admin";
import { requireOrgAdmin } from "@/infrastructure/auth/session";
import { lineConfig } from "@/infrastructure/line/line-client";
import { appUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

export default async function HostLinePage() {
  const admin = await requireOrgAdmin();
  const hosts = await listHostsForLine(admin, hostLineDeps(admin.organizationId));

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">แจ้งเตือน Host ทาง LINE</h1>
        <p className="text-sm text-muted-foreground">เชื่อมบัญชี LINE ของผู้รับพบ เพื่อรับแจ้งเตือนและอนุมัติ E-Stamp จากมือถือ</p>
      </header>
      <HostLineAdmin initialHosts={hosts} config={{ ...lineConfig(), webhookUrl: `${appUrl()}/api/line/webhook` }} />
    </main>
  );
}
