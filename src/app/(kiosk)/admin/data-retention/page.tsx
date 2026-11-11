import { getRetentionOverview } from "@/features/retention/actions";
import { requireOrgAdmin } from "@/infrastructure/auth/session";
import { RetentionAdmin } from "@/features/retention/components/retention-admin";

export const dynamic = "force-dynamic";

export default async function DataRetentionPage() {
  await requireOrgAdmin();
  // getRetentionOverview() เรียก requireAdmin() ภายใน
  const overview = await getRetentionOverview();

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">ระยะเวลาเก็บข้อมูล (PDPA)</h1>
        <p className="text-sm text-muted-foreground">ลบรูปถ่ายและข้อมูลส่วนบุคคลของผู้ติดต่ออัตโนมัติเมื่อครบกำหนด</p>
      </header>
      <RetentionAdmin initial={overview} />
    </main>
  );
}
