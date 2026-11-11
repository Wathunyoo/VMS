/**
 * สำรองข้อมูลทันที (ฐานข้อมูล + รูปถ่าย/สลิป + .env)
 *   npm run backup:now
 * ต้องเปิดฐานข้อมูลอยู่ (npm run db:local หรือ เริ่มโปรแกรม.command)
 */
import "dotenv/config";
import path from "node:path";
import { backupConfig, runBackupNow } from "@/infrastructure/backup/backup-service";

runBackupNow("MANUAL")
  .then((r) => {
    const rows = Object.entries(r.manifest.tables)
      .filter(([t]) => !t.startsWith("_"))
      .reduce((a, [, n]) => a + n, 0);
    console.log(`
สำรองข้อมูลเรียบร้อย
  ไฟล์:     ${r.file}
  ขนาด:     ${(r.size / 1024 / 1024).toFixed(2)} MB  (${rows.toLocaleString()} แถว, ${r.manifest.files.length} โฟลเดอร์/ไฟล์)
  สำเนา:    ${r.copy ?? "— (ยังไม่ได้ตั้ง BACKUP_COPY_DIR)"}
  เก็บไว้:  ${backupConfig().keep} ไฟล์ล่าสุด${r.removed.length ? ` (ลบไฟล์เก่า ${r.removed.length})` : ""}
  ตรวจสอบ: sha256 ${r.sha256.slice(0, 16)}…  ใน ${path.dirname(r.file)}
`);
  })
  .catch((e) => {
    console.error("สำรองข้อมูลไม่สำเร็จ:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
