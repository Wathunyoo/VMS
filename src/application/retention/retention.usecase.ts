import type { PhotoDeleter, PurgeCounts, PurgeLogView, RetentionPolicy, RetentionRepository } from "./retention.types";

export interface RetentionDeps {
  repo: RetentionRepository;
  photos: PhotoDeleter;
  now?: () => Date;
}

export class RetentionError extends Error {}

export const LIMITS = {
  photoDays: { min: 7, max: 3650 },
  personalDataDays: { min: 30, max: 3650 },
};

const DAY_MS = 86_400_000;
const BATCH = 200;

const fmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export function cutoffs(policy: RetentionPolicy, now: Date) {
  return {
    photos: new Date(now.getTime() - policy.photoDays * DAY_MS),
    personal: new Date(now.getTime() - policy.personalDataDays * DAY_MS),
  };
}

export function validatePolicy(p: RetentionPolicy): string | null {
  const ok = (v: number, { min, max }: { min: number; max: number }) => Number.isInteger(v) && v >= min && v <= max;
  if (!ok(p.photoDays, LIMITS.photoDays)) return `ระยะเก็บรูปต้องอยู่ระหว่าง ${LIMITS.photoDays.min}–${LIMITS.photoDays.max} วัน`;
  if (!ok(p.personalDataDays, LIMITS.personalDataDays))
    return `ระยะเก็บข้อมูลส่วนบุคคลต้องอยู่ระหว่าง ${LIMITS.personalDataDays.min}–${LIMITS.personalDataDays.max} วัน`;
  if (p.personalDataDays < p.photoDays) return "ระยะเก็บข้อมูลส่วนบุคคลต้องไม่น้อยกว่าระยะเก็บรูป";
  return null;
}

export async function getPolicy(deps: RetentionDeps) {
  return deps.repo.getPolicy();
}

export async function updatePolicy(policy: RetentionPolicy, actor: string, deps: RetentionDeps) {
  const problem = validatePolicy(policy);
  if (problem) throw new RetentionError(problem);
  await deps.repo.savePolicy(policy, actor);
  return policy;
}

/** นับสิ่งที่จะถูกลบถ้ารันตอนนี้ (ไม่เปลี่ยนข้อมูล) */
export async function previewPurge(deps: RetentionDeps): Promise<PurgeCounts> {
  const policy = await deps.repo.getPolicy();
  const c = cutoffs(policy, deps.now?.() ?? new Date());
  const [photosDeleted, personal] = await Promise.all([
    deps.repo.countExpiredPhotos(c.photos),
    deps.repo.countPersonalDataDue(c.personal),
  ]);
  return { photosDeleted, ...personal };
}

let running = false;

export async function runPurge(trigger: "AUTO" | "MANUAL", deps: RetentionDeps, actor?: string): Promise<PurgeCounts> {
  if (running) throw new RetentionError("กำลังลบข้อมูลอยู่ กรุณารอสักครู่");
  running = true;
  const policy = await deps.repo.getPolicy();
  const now = deps.now?.() ?? new Date();
  const c = cutoffs(policy, now);
  const counts: PurgeCounts = { photosDeleted: 0, visitorsAnonymized: 0, vehiclesAnonymized: 0, visitsCleaned: 0 };

  try {
    // 1) รูปถ่าย — ลบไฟล์ก่อน แล้วค่อยล้างการอ้างอิงใน DB
    for (;;) {
      const batch = await deps.repo.findExpiredPhotos(c.photos, BATCH);
      if (batch.length === 0) break;
      for (const ref of batch) await deps.photos.deleteByUrl(ref.url);
      await deps.repo.clearPhotoRefs(batch);
      counts.photosDeleted += batch.length;
      if (batch.length < BATCH) break;
    }

    // 2) ข้อมูลส่วนบุคคล → ไม่ระบุตัวตน
    Object.assign(counts, await deps.repo.anonymizePersonalData(c.personal, now));

    await deps.repo.logRun({ ...counts, trigger, actor, policy });
    return counts;
  } catch (e) {
    await deps.repo
      .logRun({ ...counts, trigger, actor, policy, error: e instanceof Error ? e.message.slice(0, 500) : String(e) })
      .catch(() => {});
    throw e;
  } finally {
    running = false;
  }
}

export async function listPurgeRuns(deps: RetentionDeps, limit = 20): Promise<PurgeLogView[]> {
  const rows = await deps.repo.listRuns(limit);
  return rows.map(({ ranAt, ...r }) => ({ ...r, ranAtText: fmt.format(ranAt) }));
}
