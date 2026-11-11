import { listStaff } from "@/application/auth/auth.usecase";
import { authDeps, deviceDeps } from "@/container";
import { UsersAdmin } from "@/features/admin-users/components/users-admin";
import { isPlatformOrg, requireAdmin } from "@/infrastructure/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const [users, points] = await Promise.all([
    listStaff(admin, authDeps),
    isPlatformOrg(admin) ? [] : deviceDeps(admin.organizationId).devices.list(),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">จัดการเจ้าหน้าที่</h1>
        <p className="text-sm text-muted-foreground">เพิ่มบัญชี รีเซ็ตรหัสผ่าน และเปิด/ปิดการใช้งาน</p>
      </header>
      <UsersAdmin initialUsers={users} currentUserId={admin.id} points={points.map((p) => ({ id: p.id, name: p.name }))} />
    </main>
  );
}
