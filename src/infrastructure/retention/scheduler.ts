import { runPurge } from "@/application/retention/retention.usecase";
import { retentionDeps } from "@/container";
import { listOrganizationsForRetention } from "@/infrastructure/repositories/prisma-retention.repository";

const INTERVAL_MS = 6 * 3600_000; // ทุก 6 ชม.
const FIRST_RUN_DELAY_MS = 60_000; // รอบแรก 1 นาทีหลังเซิร์ฟเวอร์เริ่ม

const g = globalThis as unknown as { __vmsRetentionTimer?: ReturnType<typeof setInterval> };

/** รันทีละองค์กร ตามนโยบายของแต่ละองค์กร — องค์กรหนึ่งล้มเหลวไม่กระทบองค์กรอื่น */
async function tick() {
  let orgs: { id: string; slug: string }[];
  try {
    orgs = await listOrganizationsForRetention();
  } catch (e) {
    console.error("[retention] cannot list organizations", e);
    return;
  }
  for (const org of orgs) {
    try {
      const deps = retentionDeps(org.id);
      if (!(await deps.repo.getPolicy()).autoEnabled) continue;
      const r = await runPurge("AUTO", deps, "system");
      const total = r.photosDeleted + r.visitorsAnonymized + r.vehiclesAnonymized + r.visitsCleaned;
      if (total > 0) console.info(`[retention] ${org.slug}: auto purge`, r);
    } catch (e) {
      console.error(`[retention] ${org.slug}: auto purge failed`, e);
    }
  }
}

/** เริ่มตัวตั้งเวลา (เรียกครั้งเดียวจาก instrumentation) — สำหรับเซิร์ฟเวอร์ตัวเดียว */
export function startRetentionScheduler() {
  if (g.__vmsRetentionTimer) return;
  setTimeout(tick, FIRST_RUN_DELAY_MS).unref?.();
  g.__vmsRetentionTimer = setInterval(tick, INTERVAL_MS);
  g.__vmsRetentionTimer.unref?.();
}
