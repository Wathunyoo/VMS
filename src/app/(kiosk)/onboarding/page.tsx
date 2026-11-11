import { redirect } from "next/navigation";
import { onboardingDeps } from "@/container";
import { OnboardingWizard } from "@/features/onboarding/components/onboarding-wizard";
import { requireOperator } from "@/infrastructure/auth/session";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireOperator({ allowOnboarding: true });
  if (user.role !== "ADMIN" || !user.needsOnboarding) redirect("/home");

  const st = await onboardingDeps(user.organizationId).repo.status();
  const hasDirectory = st.firstSite?.mode === "VILLAGE" ? st.tenantCount > 0 : st.hostCount > 0;
  const step = !st.firstSite ? 1 : hasDirectory ? 3 : 2;

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-8">
      <OnboardingWizard
        orgName={user.orgName}
        initialStep={step}
        site={st.firstSite && { mode: st.firstSite.mode, name: st.firstSite.name }}
        orgMode={st.orgMode}
        counts={{ hosts: st.hostCount, tenants: st.tenantCount }}
      />
    </main>
  );
}
