import { listActiveVisits } from "@/application/check-out/check-out.usecase";
import { checkOutDeps } from "@/container";
import { CheckOutConsole } from "@/features/check-out/components/check-out-console";
import { requireOperator } from "@/infrastructure/auth/session";
import { StationNotice } from "@/features/billing/components/station-notice";

export const dynamic = "force-dynamic";

export default async function CheckOutPage() {
  const staff = await requireOperator();
  const active = await listActiveVisits(checkOutDeps(staff.organizationId));

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">คืนบัตร / ออกจากพื้นที่ (Check-out)</h1>
        <p className="text-sm text-muted-foreground">สแกน QR ตรวจ E-Stamp และสรุปเวลาที่อยู่ภายใน</p>
      </header>
      <StationNotice staff={staff} purpose="CHECK_OUT" />
      <CheckOutConsole initialActive={active} />
    </main>
  );
}
