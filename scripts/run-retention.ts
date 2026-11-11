/**
 * รันการลบข้อมูลตามระยะเวลาเก็บของทุกองค์กร (ใช้กับ cron ภายนอกได้)
 *   npm run retention:run                  ← ลบจริง ทุกองค์กร
 *   npm run retention:run -- --dry         ← แสดงจำนวนที่จะถูกลบเท่านั้น
 *   npm run retention:run -- --org acme    ← เฉพาะองค์กรเดียว
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { previewPurge, runPurge } from "@/application/retention/retention.usecase";
import { retentionDeps } from "@/container";
import { prisma } from "@/infrastructure/db/prisma";
import { listOrganizationsForRetention } from "@/infrastructure/repositories/prisma-retention.repository";

async function main() {
  const { values } = parseArgs({ options: { dry: { type: "boolean", default: false }, org: { type: "string" } } });
  const orgs = (await listOrganizationsForRetention()).filter((o) => !values.org || o.slug === values.org);
  if (orgs.length === 0) throw new Error("ไม่พบองค์กร");

  for (const org of orgs) {
    const deps = retentionDeps(org.id);
    const policy = await deps.repo.getPolicy();
    const result = values.dry ? await previewPurge(deps) : await runPurge("MANUAL", deps, "cli");
    console.log(
      `[${org.slug}] รูป ${policy.photoDays} วัน / ข้อมูลส่วนบุคคล ${policy.personalDataDays} วัน → ${values.dry ? "จะลบ" : "ลบแล้ว"}`,
      result,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
