"use server";

import { revalidatePath } from "next/cache";
import { runBackupNow } from "@/infrastructure/backup/backup-service";
import { requirePlatformAdmin } from "@/infrastructure/auth/station";

export async function backupNowAction(): Promise<{ ok: true; file: string } | { ok: false; error: string }> {
  await requirePlatformAdmin();
  try {
    const r = await runBackupNow("MANUAL");
    revalidatePath("/platform/backups");
    return { ok: true, file: r.file.split("/").pop()! };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "สำรองข้อมูลไม่สำเร็จ" };
  }
}
