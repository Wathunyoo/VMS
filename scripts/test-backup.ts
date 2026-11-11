/**
 * ทดสอบสำรองข้อมูล / กู้คืน
 *   npm run test:backup
 * ใช้ฐานข้อมูลชั่วคราว "vms_backup_test" (สร้างใหม่และลบทิ้งเมื่อจบ) และโฟลเดอร์ชั่วคราว
 * — ไม่แตะข้อมูลจริงและไฟล์สำรองจริง
 */
import "dotenv/config";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import pg from "pg";

const run = promisify(execFile);
let passed = 0;
let failed = 0;
async function check(name: string, fn: () => boolean | Promise<boolean>) {
  try {
    const ok = await fn();
    ok ? passed++ : failed++;
    console.log(`${ok ? "  ✓" : "  ✗ FAIL"}  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ FAIL  ${name} — ${e instanceof Error ? e.message : e}`);
  }
}
const rejects = (p: Promise<unknown>, contains?: string) =>
  p.then(
    () => false,
    (e: Error) => !contains || e.message.includes(contains),
  );

const TEST_DB = "vms_backup_test";
const realUrl = new URL(process.env.DATABASE_URL!);
const testUrl = new URL(realUrl.toString());
testUrl.pathname = `/${TEST_DB}`;
const adminUrl = new URL(realUrl.toString());
adminUrl.pathname = "/postgres";
adminUrl.searchParams.delete("schema");

async function admin(sql: string) {
  const c = new pg.Client({ connectionString: adminUrl.toString() });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

async function snapshot(): Promise<Record<string, string[]>> {
  const u = new URL(testUrl.toString());
  u.searchParams.delete("schema");
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  try {
    const tables = (await c.query<{ t: string }>(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY 1`)).rows;
    const out: Record<string, string[]> = {};
    for (const { t } of tables) out[t] = (await c.query<{ j: string }>(`SELECT row_to_json(x)::text AS j FROM "${t}" x`)).rows.map((r) => r.j).sort();
    return out;
  } finally {
    await c.end();
  }
}

async function sql(q: string, params: unknown[] = []) {
  const u = new URL(testUrl.toString());
  u.searchParams.delete("schema");
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  try {
    return await c.query(q, params);
  } finally {
    await c.end();
  }
}

async function main() {
  const work = await mkdtemp(path.join(tmpdir(), "vms-test-backup-"));
  const project = path.join(work, "project");
  const backupDir = path.join(work, "backups");
  const copyDir = path.join(work, "offsite");
  const key = randomBytes(32).toString("hex");
  try {
    // ---------- เตรียมฐานข้อมูลทดสอบ ----------
    await admin(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await admin(`CREATE DATABASE ${TEST_DB}`);
    await run("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: testUrl.toString() }, maxBuffer: 8 * 1024 * 1024 });

    // ใช้ Prisma กับฐานทดสอบ — ต้องตั้ง DATABASE_URL ก่อน import
    process.env.DATABASE_URL = testUrl.toString();
    process.env.BACKUP_DIR = backupDir;
    process.env.BACKUP_COPY_DIR = "";
    const { prisma } = await import("@/infrastructure/db/prisma");
    const { createBackup, restoreBackup, verifyArchive, listBackups, decryptFile, parseKey } = await import("@/infrastructure/backup/backup");
    const { runBackupNow, readBackupStatus, backupIsDue } = await import("@/infrastructure/backup/backup-service");

    // ข้อมูลตัวอย่างที่มีชนิดข้อมูลหลากหลาย: enum, enum[], text[], json, decimal, timestamp, boolean, null, ภาษาไทย
    const org = await prisma.organization.create({ data: { slug: "bk-test", name: "หมู่บ้าน \"ทดสอบ\" 'สำรอง'", status: "ACTIVE", paidUntil: new Date("2027-01-31T17:00:00.123Z") } });
    const site = await prisma.site.create({ data: { organizationId: org.id, code: "S1", name: "หมู่บ้าน, ทดสอบ\nบรรทัด 2", mode: "VILLAGE" } });
    const house = await prisma.tenant.create({ data: { organizationId: org.id, siteId: site.id, name: "99/1", floor: "1" } });
    const host = await prisma.host.create({ data: { organizationId: org.id, siteId: site.id, fullName: "สมชาย ใจดี", tenantId: house.id } });
    const visitor = await prisma.visitor.create({ data: { organizationId: org.id, fullName: "ผู้มาหา 😀", idType: "NATIONAL_ID", idNumberHash: "h1", idNumberMasked: "X-XXXX", pdpaConsentAt: new Date() } });
    const visit = await prisma.visit.create({
      data: {
        organizationId: org.id, passCode: "V-BK0001", siteId: site.id, mode: "VILLAGE", visitorId: visitor.id, hostId: host.id, tenantId: house.id,
        purpose: "GUEST", expectedCheckOutAt: new Date(), customValues: [{ id: "f1", label: "ผู้ติดตาม", value: "2" }],
        safetyCheck: { create: { organizationId: org.id, highRiskWorks: ["HOT_WORK", "LIFTING"] } },
        vehicle: { create: { organizationId: org.id, plateNumber: "1กข 1234", vehicleType: "CAR", weightInKg: "1234.56" } },
      },
    });
    await prisma.customField.create({ data: { organizationId: org.id, label: "สีรถ", type: "SELECT", options: ["ขาว", "ดำ, เทา"], modes: ["VILLAGE", "OFFICE"] } });
    await prisma.formSetting.create({ data: { organizationId: org.id, fields: { phone: "REQUIRED" }, disabledPurposes: ["INTERVIEW"] } });
    await mkdir(path.join(project, "storage", "photos", "faces"), { recursive: true });
    await mkdir(path.join(project, "storage", "slips"), { recursive: true });
    await writeFile(path.join(project, "storage", "photos", "faces", "a.jpg"), "PHOTO-ORIGINAL");
    await writeFile(path.join(project, "storage", "slips", "s.png"), "SLIP-ORIGINAL");
    await writeFile(path.join(project, ".env"), `ID_HASH_SECRET="secret-A"\nPASS_TOKEN_SECRET="pass-A"\n`);
    const before = await snapshot();

    console.log("\nสำรองข้อมูล");
    const r = await createBackup({ databaseUrl: testUrl.toString(), projectDir: project, backupDir, copyDir, key, keep: 3, now: new Date("2026-10-05T10:00:00Z") });
    await check("สร้างไฟล์ .tar.gz และตรวจไฟล์ผ่าน", async () => existsSync(r.file) && (await verifyArchive(r.file)).app === "vms" && r.size > 0);
    await check("นับแถวครบทุกตาราง + มีรายการ migration", () =>
      r.manifest.tables.Visit === 1 && r.manifest.tables.Organization === 2 /* + องค์กร main ที่ migration สร้างให้ */ && r.manifest.tables.CustomField === 1 && r.manifest.migrations.length >= 10);
    await check("รวมรูปถ่าย สลิป และ .env", () => ["storage/photos", "storage/slips", ".env"].every((f) => r.manifest.files.includes(f)));
    await check("ไม่มีไฟล์ค้าง (.partial) ในโฟลเดอร์สำรอง", async () =>
      (await listBackups(backupDir)).length === 1 && !(await readdir(backupDir)).some((x) => x.endsWith(".partial")));
    await check("สำเนานอกเครื่องถูกเข้ารหัส (อ่านไม่ออกถ้าไม่มีกุญแจ)", async () => {
      const raw = await readFile(r.copy!);
      return raw.subarray(0, 6).toString() === "VMSBK1" && !raw.includes(Buffer.from("manifest.json"));
    });
    await check("ถอดรหัสด้วยกุญแจที่ถูกต้อง → ได้ไฟล์เดิม", async () => {
      const out = path.join(work, "dec.tar.gz");
      await decryptFile(r.copy!, out, parseKey(key));
      return (await readFile(out)).equals(await readFile(r.file));
    });
    await check("กุญแจผิด → ไม่ผ่าน", () => rejects(decryptFile(r.copy!, path.join(work, "x.tgz"), parseKey(randomBytes(32).toString("hex"))), "กุญแจ"));
    await check("ไฟล์เข้ารหัสถูกแก้ไข → ไม่ผ่าน", async () => {
      const tampered = path.join(work, "tampered.enc");
      const buf = await readFile(r.copy!);
      buf[buf.length - 40] ^= 0xff;
      await writeFile(tampered, buf);
      return rejects(decryptFile(tampered, path.join(work, "y.tgz"), parseKey(key)));
    });
    await check("มีโฟลเดอร์สำเนาแต่ไม่มีกุญแจ → แจ้งก่อนเริ่ม", () =>
      rejects(createBackup({ databaseUrl: testUrl.toString(), projectDir: project, backupDir, copyDir, key: null }), "BACKUP_KEY"));
    await check("ไฟล์ที่ไม่ใช่ไฟล์สำรอง → ตรวจไม่ผ่าน", async () => {
      const junk = path.join(work, "junk.tar.gz");
      await writeFile(junk, "not a tarball");
      return rejects(verifyArchive(junk));
    });

    console.log("\nกู้คืน");
    // เปลี่ยนข้อมูลหลังสำรอง: ลบ เพิ่ม แก้ไข และแก้ไฟล์
    await prisma.visit.deleteMany({});
    await prisma.vehicleInfo.deleteMany({});
    await prisma.host.update({ where: { id: host.id }, data: { fullName: "ชื่อถูกแก้" } });
    await prisma.tenant.create({ data: { organizationId: org.id, siteId: site.id, name: "ควรหายไป", floor: "9" } });
    await writeFile(path.join(project, "storage", "photos", "faces", "a.jpg"), "PHOTO-CHANGED");
    await writeFile(path.join(project, "storage", "photos", "faces", "new.jpg"), "NEW");
    await writeFile(path.join(project, ".env"), `ID_HASH_SECRET="secret-B"\nPASS_TOKEN_SECRET="pass-B"\n`);

    const res = await restoreBackup(r.file, { databaseUrl: testUrl.toString(), projectDir: project, now: new Date("2026-10-05T11:00:00Z") });
    const after = await snapshot();
    await check("ข้อมูลทุกตารางกลับมาเหมือนเดิมทุกแถว (enum[], text[], json, ทศนิยม, เวลา, ภาษาไทย)", () => JSON.stringify(after) === JSON.stringify(before));
    await check("แถวที่เพิ่มหลังสำรองถูกลบ / แถวที่ถูกแก้กลับเป็นค่าเดิม", async () =>
      (await prisma.tenant.count({ where: { name: "ควรหายไป" } })) === 0 && (await prisma.host.findUniqueOrThrow({ where: { id: host.id } })).fullName === "สมชาย ใจดี");
    await check("Foreign key ใช้งานได้หลังกู้คืน (visit → visitor/host/vehicle)", async () => {
      const v = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id }, include: { visitor: true, host: true, vehicle: true, safetyCheck: true } });
      return v.visitor.fullName === "ผู้มาหา 😀" && v.host?.fullName === "สมชาย ใจดี" && Number(v.vehicle?.weightInKg) === 1234.56 && v.safetyCheck?.highRiskWorks.join() === "HOT_WORK,LIFTING";
    });
    await check("รูปถ่าย/สลิปกลับเป็นของเดิม และของปัจจุบันถูกย้ายเก็บไว้", async () =>
      (await readFile(path.join(project, "storage", "photos", "faces", "a.jpg"), "utf8")) === "PHOTO-ORIGINAL" &&
      !existsSync(path.join(project, "storage", "photos", "faces", "new.jpg")) &&
      !!res.previousStorage && (await readFile(path.join(res.previousStorage, "photos", "faces", "new.jpg"), "utf8")) === "NEW");
    await check(".env ไม่ถูกเขียนทับ — ค่าลับต่างกัน → เก็บเป็น .env.from-backup", async () =>
      res.envNote === "differs" && (await readFile(path.join(project, ".env"), "utf8")).includes("secret-B") && (await readFile(path.join(project, ".env.from-backup"), "utf8")).includes("secret-A"));
    await check("กู้คืนจากสำเนาเข้ารหัสได้", async () => {
      await prisma.customField.deleteMany({});
      await restoreBackup(r.copy!, { databaseUrl: testUrl.toString(), projectDir: project, key, restoreFiles: false });
      return (await prisma.customField.count()) === 1;
    });
    await check("ไฟล์สำรองจากโปรแกรมรุ่นใหม่กว่า → ไม่กู้ และข้อมูลเดิมไม่เปลี่ยน", async () => {
      const last = r.manifest.migrations[r.manifest.migrations.length - 1];
      const row = (await sql(`SELECT * FROM "_prisma_migrations" WHERE migration_name = $1`, [last])).rows[0];
      await sql(`DELETE FROM "_prisma_migrations" WHERE migration_name = $1`, [last]);
      await prisma.tenant.create({ data: { organizationId: org.id, siteId: site.id, name: "ต้องยังอยู่", floor: "1" } });
      const ok = await rejects(restoreBackup(r.file, { databaseUrl: testUrl.toString(), projectDir: project, restoreFiles: false }), "รุ่นใหม่กว่า");
      const kept = (await prisma.tenant.count({ where: { name: "ต้องยังอยู่" } })) === 1;
      const cols = Object.keys(row);
      await sql(`INSERT INTO "_prisma_migrations" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((c) => row[c]));
      return ok && kept;
    });
    await check("กู้คืนล้มเหลวกลางทาง → ย้อนกลับทั้งหมด (ไม่มีข้อมูลครึ่ง ๆ)", async () => {
      // ทำไฟล์สำรองที่จำนวนแถวไม่ตรงกับ manifest
      const bad = path.join(work, "bad");
      await mkdir(bad);
      await run("tar", ["-xzf", r.file, "-C", bad]);
      const m = JSON.parse(await readFile(path.join(bad, "manifest.json"), "utf8"));
      m.tables.Visitor = 5;
      await writeFile(path.join(bad, "manifest.json"), JSON.stringify(m));
      const badFile = path.join(work, "bad.tar.gz");
      await run("tar", ["-czf", badFile, "-C", bad, "."]);
      const countBefore = await prisma.tenant.count();
      const ok = await rejects(restoreBackup(badFile, { databaseUrl: testUrl.toString(), projectDir: project, restoreFiles: false }), "ไม่ตรง");
      return ok && (await prisma.tenant.count()) === countBefore;
    });

    console.log("\nเก็บไฟล์ / ตั้งเวลา");
    for (let i = 1; i <= 4; i++) await createBackup({ databaseUrl: testUrl.toString(), projectDir: project, backupDir, keep: 3, now: new Date(Date.UTC(2026, 9, 5, 12, i)) });
    await check("เก็บไว้เฉพาะ 3 ไฟล์ล่าสุด (ลบไฟล์เก่าอัตโนมัติ)", async () => {
      const l = await listBackups(backupDir);
      return l.length === 3 && l[0].name > l[2].name;
    });
    await check("ยังไม่เคยสำรอง → ถึงเวลาสำรอง", async () => await backupIsDue());
    const now1 = await runBackupNow("MANUAL");
    await check("สำรองผ่านบริการ → บันทึกสถานะสำเร็จ", async () => {
      const s = await readBackupStatus();
      return s.lastFile === now1.file && !s.lastError && s.lastTables?.Visit === 1;
    });
    await check("เพิ่งสำรองไป → ยังไม่ถึงเวลา / ผ่านไป 25 ชม. → ถึงเวลา", async () =>
      !(await backupIsDue()) && (await backupIsDue(new Date(Date.now() + 25 * 3600_000))));
    await check("สำรองซ้อนกัน 2 ครั้งพร้อมกัน → ทำงานเดียว", async () => {
      const [a, b] = await Promise.all([runBackupNow("MANUAL"), runBackupNow("MANUAL")]);
      return a.file === b.file;
    });
    await check("ไฟล์สำรองเปิดได้เฉพาะเจ้าของเครื่อง (สิทธิ์ 600 / โฟลเดอร์ 700)", async () =>
      ((await stat(now1.file)).mode & 0o777) === 0o600 && ((await stat(backupDir)).mode & 0o777) === 0o700);

    await prisma.$disconnect();
  } finally {
    await admin(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`).catch((e) => console.error("drop test db failed", e));
    await rm(work, { recursive: true, force: true });
  }
  console.log(`\nผล: ผ่าน ${passed} / ${passed + failed}${failed ? `  —  ไม่ผ่าน ${failed}` : ""}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
