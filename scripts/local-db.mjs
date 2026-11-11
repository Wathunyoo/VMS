// รัน PostgreSQL แบบฝังในโปรเจกต์ (ไม่ต้องติดตั้ง Docker/Postgres)
// ข้อมูลเก็บที่ .pgdata/ — กด Ctrl+C เพื่อหยุด
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dataDir = new URL("../.pgdata", import.meta.url).pathname;
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "vms", password: "vms", port: 5432, persistent: true });

if (!existsSync(dataDir)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("vms");
} catch {
  // มีอยู่แล้ว
}
console.log("PostgreSQL พร้อมใช้งานที่ localhost:5432 (db: vms) — กด Ctrl+C เพื่อหยุด");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
