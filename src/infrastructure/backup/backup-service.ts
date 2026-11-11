import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createBackup, listBackups, type BackupResult } from "./backup";

/** การตั้งค่าจาก .env */
export function backupConfig() {
  const dir = (k: string) => {
    const v = process.env[k]?.trim();
    return v ? path.resolve(v.replace(/^~(?=$|\/)/, homedir())) : null;
  };
  const keep = Math.trunc(Number(process.env.BACKUP_KEEP));
  return {
    backupDir: dir("BACKUP_DIR") ?? path.join(homedir(), "VMS-Backups"),
    copyDir: dir("BACKUP_COPY_DIR"),
    key: process.env.BACKUP_KEY?.trim() || null,
    keep: Number.isFinite(keep) && keep >= 3 && keep <= 365 ? keep : 14,
    enabled: process.env.BACKUP_SCHEDULER !== "off",
    databaseUrl: process.env.DATABASE_URL ?? "",
    projectDir: /* turbopackIgnore: true */ process.cwd(),
  };
}

export interface BackupStatus {
  lastSuccessAt: string | null;
  lastFile: string | null;
  lastSize: number | null;
  lastTables: Record<string, number> | null;
  lastCopy: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  running: boolean;
}

const EMPTY: BackupStatus = {
  lastSuccessAt: null,
  lastFile: null,
  lastSize: null,
  lastTables: null,
  lastCopy: null,
  lastErrorAt: null,
  lastError: null,
  running: false,
};

const statusFile = (dir: string) => path.join(dir, ".status.json");
const g = globalThis as unknown as { __vmsBackupRunning?: Promise<BackupResult> };

export async function readBackupStatus(): Promise<BackupStatus> {
  const { backupDir } = backupConfig();
  try {
    return { ...EMPTY, ...(JSON.parse(await readFile(statusFile(backupDir), "utf8")) as Partial<BackupStatus>), running: !!g.__vmsBackupRunning };
  } catch {
    return { ...EMPTY, running: !!g.__vmsBackupRunning };
  }
}

async function writeStatus(patch: Partial<BackupStatus>) {
  const { backupDir } = backupConfig();
  await mkdir(backupDir, { recursive: true });
  const cur = await readBackupStatus();
  await writeFile(statusFile(backupDir), JSON.stringify({ ...cur, ...patch, running: false }, null, 2));
}

/** สำรองข้อมูลตอนนี้ — ถ้ากำลังสำรองอยู่ ใช้งานที่กำลังทำ (ไม่ซ้อนกัน) */
export async function runBackupNow(trigger: "AUTO" | "MANUAL"): Promise<BackupResult> {
  if (g.__vmsBackupRunning) return g.__vmsBackupRunning;
  const c = backupConfig();
  const job = (async () => {
    try {
      const r = await createBackup({ databaseUrl: c.databaseUrl, projectDir: c.projectDir, backupDir: c.backupDir, copyDir: c.copyDir, key: c.key, keep: c.keep });
      await writeStatus({
        lastSuccessAt: r.manifest.createdAt,
        lastFile: r.file,
        lastSize: r.size,
        lastTables: r.manifest.tables,
        lastCopy: r.copy,
        lastError: null,
        lastErrorAt: null,
      });
      console.info(`[backup] ${trigger}: ${path.basename(r.file)} (${(r.size / 1024 / 1024).toFixed(1)} MB)${r.copy ? " + สำเนาเข้ารหัส" : ""}`);
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await writeStatus({ lastError: msg.slice(0, 500), lastErrorAt: new Date().toISOString() }).catch(() => {});
      console.error(`[backup] ${trigger} failed:`, e);
      throw e;
    }
  })();
  g.__vmsBackupRunning = job;
  try {
    return await job;
  } finally {
    g.__vmsBackupRunning = undefined;
  }
}

export async function backupList() {
  const c = backupConfig();
  const [local, copies] = await Promise.all([listBackups(c.backupDir), c.copyDir && existsSync(c.copyDir) ? listBackups(c.copyDir) : Promise.resolve([])]);
  return { local, copies };
}

// ---------------- ตั้งเวลา ----------------

const CHECK_EVERY_MS = 30 * 60_000; // ตรวจทุก 30 นาที
const FIRST_CHECK_MS = 2 * 60_000; // รอบแรก 2 นาทีหลังเปิดโปรแกรม
const MAX_AGE_MS = 24 * 3600_000; // สำรองเมื่อครั้งล่าสุดเกิน 24 ชม.
const RETRY_AFTER_ERROR_MS = 3 * 3600_000;

const t = globalThis as unknown as { __vmsBackupTimer?: ReturnType<typeof setInterval> };

/** โปรแกรมเปิดอยู่เมื่อไหร่ ก็สำรองให้วันละครั้ง (ปิดเครื่องข้ามวัน → สำรองทันทีเมื่อเปิดใหม่) */
export async function backupIsDue(now = new Date()) {
  const s = await readBackupStatus();
  if (s.running) return false;
  if (s.lastErrorAt && now.getTime() - new Date(s.lastErrorAt).getTime() < RETRY_AFTER_ERROR_MS && (!s.lastSuccessAt || s.lastErrorAt > s.lastSuccessAt)) return false;
  return !s.lastSuccessAt || now.getTime() - new Date(s.lastSuccessAt).getTime() >= MAX_AGE_MS;
}

export function startBackupScheduler() {
  if (t.__vmsBackupTimer || !backupConfig().enabled) return;
  const tick = async () => {
    try {
      if (await backupIsDue()) await runBackupNow("AUTO");
    } catch {
      // บันทึกไว้ใน status แล้ว — ลองใหม่รอบถัดไป
    }
  };
  setTimeout(tick, FIRST_CHECK_MS).unref?.();
  t.__vmsBackupTimer = setInterval(tick, CHECK_EVERY_MS);
  t.__vmsBackupTimer.unref?.();
}
