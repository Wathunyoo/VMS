/**
 * กู้คืนข้อมูลจากไฟล์สำรอง — แทนที่ข้อมูลปัจจุบันทั้งหมด
 *   npm run backup:restore -- <ไฟล์ .tar.gz หรือ .tar.gz.enc | latest>
 *
 * ขั้นตอน: ปิดโปรแกรม (แต่เปิดฐานข้อมูลไว้: npm run db:local) → รันคำสั่งนี้ → พิมพ์ "กู้คืน" เพื่อยืนยัน
 * ก่อนกู้คืน ระบบสำรองข้อมูลปัจจุบันไว้ให้อัตโนมัติ (ย้อนกลับได้)
 */
import "dotenv/config";
import { createConnection } from "node:net";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { listBackups, restoreBackup, verifyArchive } from "@/infrastructure/backup/backup";
import { backupConfig, runBackupNow } from "@/infrastructure/backup/backup-service";

const portOpen = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = createConnection({ port, host: "127.0.0.1" });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });

async function main() {
  const c = backupConfig();
  const arg = process.argv[2];
  if (!arg) {
    const list = await listBackups(c.backupDir);
    console.log(`วิธีใช้: npm run backup:restore -- <ไฟล์ | latest>\n\nไฟล์สำรองใน ${c.backupDir}:`);
    for (const b of list.slice(0, 15)) console.log(`  ${b.name}  ${(b.size / 1024 / 1024).toFixed(2)} MB`);
    return;
  }
  const file = arg === "latest" ? (await listBackups(c.backupDir))[0]?.file : path.resolve(arg);
  if (!file) throw new Error("ไม่พบไฟล์สำรอง");
  if (await portOpen(3000)) throw new Error("โปรแกรมยังเปิดอยู่ (port 3000) — ปิดหน้าต่างโปรแกรมก่อน แล้วเปิดเฉพาะฐานข้อมูล: npm run db:local");

  if (!file.endsWith(".enc")) {
    const m = await verifyArchive(file);
    console.log(`ไฟล์: ${path.basename(file)}\nสร้างเมื่อ: ${new Date(m.createdAt).toLocaleString("th-TH")}  จากเครื่อง ${m.host}`);
    console.log(`ข้อมูล: ${Object.entries(m.tables).filter(([t]) => !t.startsWith("_")).map(([t, n]) => `${t} ${n}`).join(", ")}`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question('\n⚠️  ข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่ด้วยข้อมูลในไฟล์นี้\nพิมพ์ "กู้คืน" เพื่อยืนยัน: ');
  rl.close();
  if (ans.trim() !== "กู้คืน") {
    console.log("ยกเลิก — ไม่มีการเปลี่ยนแปลง");
    return;
  }

  console.log("\n1/2 สำรองข้อมูลปัจจุบันไว้ก่อน…");
  const safety = await runBackupNow("MANUAL");
  console.log(`    เก็บไว้ที่ ${safety.file}`);

  console.log("2/2 กู้คืน…");
  const r = await restoreBackup(file, { databaseUrl: c.databaseUrl, projectDir: c.projectDir, key: c.key });
  console.log(`
กู้คืนเรียบร้อย
  ตาราง:  ${Object.keys(r.tables).length} ตาราง (${Object.values(r.tables).reduce((a, n) => a + n, 0).toLocaleString()} แถว)${r.skippedTables.length ? `  ข้าม: ${r.skippedTables.join(", ")}` : ""}
  รูป/สลิป: ${r.filesRestored ? "กู้คืนแล้ว" : "ไม่ได้กู้"}${r.previousStorage ? `  (ของเดิมย้ายไว้ที่ ${r.previousStorage})` : ""}
  .env:   ${{ same: "ค่าลับตรงกัน", copied: "คัดลอกจากไฟล์สำรอง", differs: "⚠️ ค่าลับไม่ตรง — ดู .env.from-backup (ถ้าย้ายเครื่อง ให้ใช้ ID_HASH_SECRET / PASS_TOKEN_SECRET จากไฟล์นั้น)", none: "—" }[r.envNote]}
  ถ้าต้องการย้อนกลับ: npm run backup:restore -- ${safety.file}
`);
}

main().catch((e) => {
  console.error("กู้คืนไม่สำเร็จ (ข้อมูลเดิมไม่ถูกเปลี่ยน):", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
