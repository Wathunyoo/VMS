import { directoryAdminDeps } from "@/container";
import { DirectoryAdmin } from "@/features/directory-admin/components/directory-admin";
import { requireOrgAdmin } from "@/infrastructure/auth/session";

export const dynamic = "force-dynamic";

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<{ site?: string; tab?: string }> }) {
  const admin = await requireOrgAdmin();
  const { site: siteParam, tab } = await searchParams;
  const repo = directoryAdminDeps(admin.organizationId).repo;
  const [sites, orgMode, houseQuota] = await Promise.all([repo.sites(), repo.orgMode(), repo.houseQuota()]);
  const site = sites.find((s) => s.id === siteParam) ?? sites[0] ?? null;
  const [units, people, bays] = site ? await Promise.all([repo.units(site.id), repo.people(site.id), repo.bays(site.id)]) : [[], [], []];

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">รายชื่อหลัก</h1>
        <p className="text-sm text-muted-foreground">สถานที่ · บริษัทผู้เช่า/บ้าน · ผู้รับพบ/ลูกบ้าน · จุดขนถ่ายสินค้า — ปิดใช้งานแทนการลบ เพื่อให้ประวัติเดิมยังครบ</p>
      </header>
      <DirectoryAdmin key={site?.id ?? "none"} orgMode={orgMode} sites={sites} site={site} units={units} people={people} bays={bays} houseQuota={houseQuota} initialTab={tab} />
    </main>
  );
}
