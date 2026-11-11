import { getFormSettings } from "@/application/settings/form-settings.usecase";
import { formSettingsDeps } from "@/container";
import { SITE_MODES } from "@/domain/visit/types";
import { FormSettings } from "@/features/form-settings/components/form-settings";
import { requireOrgAdmin } from "@/infrastructure/auth/session";
import { getCheckInDirectory } from "@/infrastructure/repositories/prisma-directory.repository";
import { organizationMode } from "@/infrastructure/repositories/org-mode";

export const dynamic = "force-dynamic";

export default async function FormSettingsPage() {
  const admin = await requireOrgAdmin();
  const [{ config, customFields }, sites, orgMode] = await Promise.all([
    getFormSettings(admin, formSettingsDeps(admin.organizationId)),
    getCheckInDirectory(admin.organizationId),
    organizationMode(admin.organizationId),
  ]);
  const modes = orgMode ? [orgMode] : SITE_MODES.filter((m) => sites.some((s) => s.mode === m));

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">แบบฟอร์ม Check-in</h1>
        <p className="text-sm text-muted-foreground">เลือกช่องที่ต้องการให้ รปภ. กรอก บังคับกรอก หรือซ่อน และเพิ่มช่องของคุณเอง</p>
      </header>
      <FormSettings config={config} customFields={customFields} modes={modes.length ? modes : ["OFFICE"]} />
    </main>
  );
}
