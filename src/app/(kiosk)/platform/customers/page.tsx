import { CONTRACT_NOTICE_DAYS } from "@/domain/org/contract";
import { CustomersAdmin } from "@/features/customers/components/customers-admin";
import { parseCustomerFilter } from "@/features/customers/customer-view";
import { loadCustomerViews } from "@/features/customers/load-customers";
import { requirePlatformAdmin } from "@/infrastructure/auth/station";
import { appUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePlatformAdmin();
  const [customers, params] = await Promise.all([loadCustomerViews(), searchParams]);

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">ลูกค้า</h1>
        <p className="text-sm text-muted-foreground">สร้างองค์กรให้ลูกค้าตอนติดตั้งที่หน้างาน · จำนวนจุด/บ้าน วันสิ้นสุดสัญญา และข้อมูลใบกำกับภาษี · ระงับ/เปิดใช้งาน · รีเซ็ตรหัสผู้ดูแล</p>
      </header>
      <CustomersAdmin customers={customers} loginUrl={`${appUrl()}/login`} initialFilter={parseCustomerFilter(params)} noticeDays={CONTRACT_NOTICE_DAYS} />
    </main>
  );
}
