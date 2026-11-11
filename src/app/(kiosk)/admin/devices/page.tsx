import { computeAccess } from "@/domain/billing/access";
import { deviceDeps } from "@/container";
import { DevicesAdmin } from "@/features/devices/components/devices-admin";
import { deviceToken } from "@/infrastructure/auth/device-cookie";
import { requireOrgAdmin } from "@/infrastructure/auth/session";
import { randomTokens } from "@/infrastructure/security/tokens";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });

export default async function DevicesPage() {
  const admin = await requireOrgAdmin();
  const deps = deviceDeps(admin.organizationId);
  const [devices, org, token] = await Promise.all([deps.devices.list(), deps.repo.org(), deviceToken()]);
  const thisDevice = token ? await deps.devices.findActive(randomTokens.hash(token)) : null;
  const access = computeAccess(org, new Date());

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">จุด Check-in</h1>
        <p className="text-sm text-muted-foreground">สร้างจุดและบัญชีเจ้าหน้าที่ประจำจุด · จำนวนจุดตามสัญญา</p>
      </header>
      <DevicesAdmin
        limit={access.pointLimit}
        points={devices.map((d) => ({
          id: d.id,
          name: d.name,
          createdBy: d.createdBy,
          createdText: fmt.format(d.createdAt),
          lastSeenText: d.lastSeenAt ? fmt.format(d.lastSeenAt) : null,
          hasDevice: d.hasDevice,
          isThis: d.id === thisDevice?.id,
          staff: d.staff,
        }))}
      />
    </main>
  );
}
