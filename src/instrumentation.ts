export async function register() {
  // ลบข้อมูลตามระยะเวลาเก็บ (PDPA) — รันเฉพาะ Node.js runtime
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.RETENTION_SCHEDULER !== "off") {
    const { startRetentionScheduler } = await import("./infrastructure/retention/scheduler");
    startRetentionScheduler();
  }
  // สำรองข้อมูลอัตโนมัติวันละครั้ง (ปิดด้วย BACKUP_SCHEDULER=off)
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.BACKUP_SCHEDULER !== "off") {
    const { startBackupScheduler } = await import("./infrastructure/backup/backup-service");
    startBackupScheduler();
  }
}
