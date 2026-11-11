import { AdminTabs } from "@/components/admin-tabs";
import { getCurrentUser, isPlatformOrg } from "@/infrastructure/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <>
      <AdminTabs platformOrg={!!user && isPlatformOrg(user)} />
      {children}
    </>
  );
}
