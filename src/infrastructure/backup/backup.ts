/**
 * สำรองข้อมูล / กู้คืน — ทั้งระบบ (ทุกองค์กร)
 *
 * ไฟล์สำรอง 1 ไฟล์ = vms-backup-YYYYMMDD-HHMMSS.tar.gz ประกอบด้วย
 *   manifest.json          เวลา จำนวนแถว รายการ migration
 *   db/<ตาราง>.jsonl        ข้อมูลทุกตาราง (แถวละ 1 บรรทัด JSON) — อ่านจาก snapshot เดียวกัน
 *   storage/photos, slips  รูปถ่ายและสลิป
 *   .env                   ค่าลับที่จำเป็น (เช่น ID_HASH_SECRET — ไม่มีแล้วค้นเลขบัตรเดิมไม่เจอ)
 *
 * ไม่ต้องติดตั้ง pg_dump — ใช้ row_to_json / json_populate_recordset ของ PostgreSQL
 * สำเนานอกเครื่อง (BACKUP_COPY_DIR) เข้ารหัส AES-256-GCM ด้วย BACKUP_KEY
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { chmod, copyFile, cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { open } from "node:fs/promises";
import { promisify } from "node:util";
import pg from "pg";

const run = promisify(execFile);
export const BACKUP_FORMAT = 1;
const PREFIX = "vms-backup-";
const MAGIC = Buffer.from("VMSBK1");
const SKIP_RESTORE = new Set(["_prisma_migrations"]);
const STORAGE_DIRS = ["storage/photos", "storage/slips"];

export interface BackupManifest {
  format: number;
  app: "vms";
  createdAt: string;
  tables: Record<string, number>;
  migrations: string[];
  files: string[];
  host: string;
}

export interface BackupResult {
  file: string;
  size: number;
  sha256: string;
  manifest: BackupManifest;
  copy: string | null;
  removed: string[];
}

export interface BackupOptions {
  databaseUrl: string;
  projectDir: string;
  backupDir: string;
  /** สำเนาเข้ารหัส (เช่น ไดรฟ์ภายนอก / โฟลเดอร์คลาวด์) */
  copyDir?: string | null;
  /** hex 64 ตัว — จำเป็นเมื่อมี copyDir */
  key?: string | null;
  keep?: number;
  now?: Date;
}

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  // ใช้เวลาเครื่อง (ไทย) ในชื่อไฟล์ ให้ผู้ใช้อ่านง่าย
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

async function sha256File(file: string) {
  const h = createHash("sha256");
  await pipeline(createReadStream(file), h);
  return h.digest("hex");
}

export function parseKey(key: string | null | undefined): Buffer {
  if (!key || !/^[0-9a-f]{64}$/i.test(key.trim())) throw new Error("BACKUP_KEY ต้องเป็นตัวเลขฐาน 16 ยาว 64 ตัว");
  return Buffer.from(key.trim(), "hex");
}

/** เข้ารหัสไฟล์: MAGIC | iv(12) | ciphertext | tag(16) */
export async function encryptFile(src: string, dest: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const out = createWriteStream(dest);
  out.write(Buffer.concat([MAGIC, iv]));
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(src);
    input.on("error", reject);
    cipher.on("error", reject);
    out.on("error", reject);
    // ต่อ tag ท้ายไฟล์หลังเข้ารหัสเสร็จ
    cipher.on("end", () => out.end(cipher.getAuthTag()));
    out.on("finish", () => resolve());
    input.pipe(cipher).pipe(out, { end: false });
  });
}

export async function decryptFile(src: string, dest: string, key: Buffer) {
  const { size } = await stat(src);
  const head = Buffer.alloc(MAGIC.length + 12);
  const fh = await open(src, "r");
  try {
    await fh.read(head, 0, head.length, 0);
    const tag = Buffer.alloc(16);
    await fh.read(tag, 0, 16, size - 16);
    if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("ไม่ใช่ไฟล์สำรองที่เข้ารหัสของ VMS");
    const decipher = createDecipheriv("aes-256-gcm", key, head.subarray(MAGIC.length));
    decipher.setAuthTag(tag);
    await pipeline(createReadStream(src, { start: head.length, end: size - 17 }), decipher, createWriteStream(dest));
  } catch (e) {
    await rm(dest, { force: true });
    if (e instanceof Error && /auth|unable to authenticate/i.test(e.message)) throw new Error("กุญแจ (BACKUP_KEY) ไม่ถูกต้อง หรือไฟล์เสียหาย");
    throw e;
  } finally {
    await fh.close();
  }
}

async function connect(databaseUrl: string) {
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  return client;
}

async function publicTables(client: pg.Client): Promise<string[]> {
  const r = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  return r.rows.map((x) => x.table_name);
}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

/** เขียนข้อมูลทุกตารางจาก snapshot เดียว (REPEATABLE READ) */
async function dumpDatabase(databaseUrl: string, outDir: string) {
  const client = await connect(databaseUrl);
  const tables: Record<string, number> = {};
  let migrations: string[] = [];
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    for (const t of await publicTables(client)) {
      const r = await client.query<{ j: string }>(`SELECT row_to_json(t)::text AS j FROM ${q(t)} t`);
      await writeFile(path.join(outDir, `${t}.jsonl`), r.rows.map((x) => x.j).join("\n") + (r.rows.length ? "\n" : ""));
      tables[t] = r.rows.length;
      if (t === "_prisma_migrations") {
        migrations = r.rows
          .map((x) => JSON.parse(x.j) as { migration_name: string; finished_at: string | null; rolled_back_at: string | null })
          .filter((m) => m.finished_at && !m.rolled_back_at)
          .map((m) => m.migration_name)
          .sort();
      }
    }
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
  return { tables, migrations };
}

export async function listBackups(dir: string) {
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir)).filter((n) => n.startsWith(PREFIX) && /\.tar\.gz(\.enc)?$/.test(n)).sort().reverse();
  return Promise.all(
    names.map(async (name) => {
      const s = await stat(path.join(dir, name));
      return { name, file: path.join(dir, name), size: s.size, createdAt: s.mtime, encrypted: name.endsWith(".enc") };
    }),
  );
}

/** เก็บไว้เฉพาะ keep ไฟล์ล่าสุด */
async function prune(dir: string, keep: number) {
  const all = await listBackups(dir);
  const old = all.slice(Math.max(1, keep));
  for (const b of old) await rm(b.file, { force: true });
  return old.map((b) => b.name);
}

export async function createBackup(o: BackupOptions): Promise<BackupResult> {
  const now = o.now ?? new Date();
  const keep = o.keep ?? 14;
  const key = o.copyDir ? parseKey(o.key) : null; // ตรวจกุญแจก่อนเริ่มงาน
  // มีข้อมูลส่วนบุคคลและค่าลับ — ให้เจ้าของเครื่องเปิดได้คนเดียว
  await mkdir(o.backupDir, { recursive: true, mode: 0o700 });
  await chmod(o.backupDir, 0o700);
  const work = await mkdtemp(path.join(tmpdir(), "vms-backup-"));
  try {
    await mkdir(path.join(work, "db"));
    const { tables, migrations } = await dumpDatabase(o.databaseUrl, path.join(work, "db"));

    const files = STORAGE_DIRS.filter((d) => existsSync(path.join(/* turbopackIgnore: true */ o.projectDir, d)));
    if (existsSync(path.join(o.projectDir, ".env"))) files.push(".env");
    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      app: "vms",
      createdAt: now.toISOString(),
      tables,
      migrations,
      files,
      host: hostname(),
    };
    await writeFile(path.join(work, "manifest.json"), JSON.stringify(manifest, null, 2));

    const name = `${PREFIX}${stamp(now)}.tar.gz`;
    const final = path.join(o.backupDir, name);
    const partial = `${final}.partial`;
    await run("tar", ["-czf", partial, "-C", work, "manifest.json", "db", ...(files.length ? ["-C", o.projectDir, ...files] : [])], {
      maxBuffer: 16 * 1024 * 1024,
    });
    await chmod(partial, 0o600);
    await verifyArchive(partial);
    await rename(partial, final);

    let copy: string | null = null;
    if (o.copyDir && key) {
      await mkdir(o.copyDir, { recursive: true });
      copy = path.join(o.copyDir, `${name}.enc`);
      await encryptFile(final, `${copy}.partial`, key);
      await chmod(`${copy}.partial`, 0o600);
      await rename(`${copy}.partial`, copy);
    }

    const removed = [...(await prune(o.backupDir, keep)), ...(o.copyDir ? await prune(o.copyDir, keep) : [])];
    return { file: final, size: (await stat(final)).size, sha256: await sha256File(final), manifest, copy, removed };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** ตรวจว่าเปิดไฟล์ได้และมี manifest ครบ */
export async function verifyArchive(file: string): Promise<BackupManifest> {
  const { stdout } = await run("tar", ["-xzOf", file, "manifest.json"], { maxBuffer: 4 * 1024 * 1024 });
  const m = JSON.parse(stdout) as BackupManifest;
  if (m.app !== "vms" || typeof m.format !== "number") throw new Error("ไม่ใช่ไฟล์สำรองของ VMS");
  if (m.format > BACKUP_FORMAT) throw new Error("ไฟล์สำรองมาจากโปรแกรมรุ่นใหม่กว่า — อัปเดตโปรแกรมก่อนกู้คืน");
  const { stdout: list } = await run("tar", ["-tzf", file], { maxBuffer: 64 * 1024 * 1024 });
  for (const t of Object.keys(m.tables)) if (!list.includes(`db/${t}.jsonl`)) throw new Error(`ไฟล์สำรองไม่ครบ (ไม่มีตาราง ${t})`);
  return m;
}

export interface RestoreOptions {
  databaseUrl: string;
  projectDir: string;
  key?: string | null;
  /** กู้รูปถ่าย/สลิปด้วย (ค่าเริ่มต้น true) */
  restoreFiles?: boolean;
  now?: Date;
}

export interface RestoreResult {
  manifest: BackupManifest;
  tables: Record<string, number>;
  skippedTables: string[];
  filesRestored: boolean;
  previousStorage: string | null;
  envNote: "same" | "copied" | "differs" | "none";
}

/**
 * กู้คืนจากไฟล์สำรอง — แทนที่ข้อมูลปัจจุบันทั้งหมด (ทำใน transaction เดียว ล้มเหลว = ไม่เปลี่ยนอะไร)
 * ต้องปิดโปรแกรมก่อน และควรสำรองข้อมูลปัจจุบันไว้ก่อน (สคริปต์ backup:restore ทำให้อัตโนมัติ)
 */
export async function restoreBackup(file: string, o: RestoreOptions): Promise<RestoreResult> {
  const work = await mkdtemp(path.join(tmpdir(), "vms-restore-"));
  try {
    let archive = file;
    if (file.endsWith(".enc")) {
      archive = path.join(work, "backup.tar.gz");
      await decryptFile(file, archive, parseKey(o.key));
    }
    const manifest = await verifyArchive(archive);
    await run("tar", ["-xzf", archive, "-C", work], { maxBuffer: 16 * 1024 * 1024 });

    const client = await connect(o.databaseUrl);
    const restored: Record<string, number> = {};
    const skippedTables: string[] = [];
    try {
      const current = new Set(await publicTables(client));
      const applied = current.has("_prisma_migrations")
        ? (await client.query<{ migration_name: string }>(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows.map((r) => r.migration_name)
        : [];
      const newer = manifest.migrations.filter((m) => !applied.includes(m));
      if (newer.length) throw new Error(`ไฟล์สำรองมาจากโปรแกรมรุ่นใหม่กว่า (${newer.join(", ")}) — อัปเดตโปรแกรมก่อนกู้คืน`);

      await client.query("BEGIN");
      // ปิดการตรวจ foreign key ระหว่างใส่ข้อมูล (ข้อมูลมาจาก snapshot ที่ถูกต้องอยู่แล้ว)
      await client.query("SET LOCAL session_replication_role = replica");
      const targets = [...current].filter((t) => !SKIP_RESTORE.has(t));
      if (targets.length) await client.query(`TRUNCATE ${targets.map(q).join(", ")} CASCADE`);

      for (const t of Object.keys(manifest.tables)) {
        if (SKIP_RESTORE.has(t)) continue;
        if (!current.has(t)) {
          skippedTables.push(t);
          continue;
        }
        const cols = new Set(
          (await client.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [t])).rows.map(
            (r) => r.column_name,
          ),
        );
        let batch: string[] = [];
        let count = 0;
        let insertCols: string[] | null = null;
        const flush = async () => {
          if (!batch.length) return;
          insertCols ??= Object.keys(JSON.parse(batch[0]) as object).filter((c) => cols.has(c));
          const list = insertCols.map(q).join(", ");
          // คอลัมน์ที่เพิ่มมาหลังวันที่สำรอง จะได้ค่าเริ่มต้นของตาราง
          await client.query(`INSERT INTO ${q(t)} (${list}) SELECT ${list} FROM json_populate_recordset(NULL::${q(t)}, $1::json)`, [`[${batch.join(",")}]`]);
          count += batch.length;
          batch = [];
        };
        const rl = createInterface({ input: createReadStream(path.join(work, "db", `${t}.jsonl`)), crlfDelay: Infinity });
        for await (const line of rl) {
          if (!line) continue;
          batch.push(line);
          if (batch.length >= 500) await flush();
        }
        await flush();
        if (count !== manifest.tables[t]) throw new Error(`จำนวนแถวของ ${t} ไม่ตรง (${count}/${manifest.tables[t]})`);
        restored[t] = count;
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      await client.end();
    }

    // รูปถ่าย/สลิป: ย้ายของเดิมเก็บไว้ แล้วใช้ของจากไฟล์สำรอง
    let previousStorage: string | null = null;
    const restoreFiles = o.restoreFiles ?? true;
    if (restoreFiles && existsSync(path.join(work, "storage"))) {
      const storage = path.join(o.projectDir, "storage");
      await mkdir(storage, { recursive: true });
      const ts = stamp(o.now ?? new Date());
      for (const d of ["photos", "slips"]) {
        const cur = path.join(storage, d);
        const from = path.join(work, "storage", d);
        if (!existsSync(from)) continue;
        if (existsSync(cur)) {
          previousStorage ??= path.join(o.projectDir, `storage-before-restore-${ts}`);
          await mkdir(previousStorage, { recursive: true });
          await rename(cur, path.join(/* turbopackIgnore: true */ previousStorage, d)).catch(async () => {
            await cp(cur, path.join(/* turbopackIgnore: true */ previousStorage!, d), { recursive: true });
            await rm(cur, { recursive: true, force: true });
          });
        }
        await cp(from, cur, { recursive: true });
      }
    }

    // .env: ไม่เขียนทับ — ถ้าค่าลับไม่ตรง เก็บของจากไฟล์สำรองไว้ข้าง ๆ ให้ตรวจ
    let envNote: RestoreResult["envNote"] = "none";
    const backupEnv = path.join(work, ".env");
    if (existsSync(backupEnv)) {
      const target = path.join(o.projectDir, ".env");
      if (!existsSync(target)) {
        await copyFile(backupEnv, target);
        envNote = "copied";
      } else {
        const secrets = (s: string) =>
          ["ID_HASH_SECRET", "PASS_TOKEN_SECRET"].map((k) => new RegExp(`^${k}=(.*)$`, "m").exec(s)?.[1]?.trim() ?? "").join("|");
        const same = secrets(await readFile(target, "utf8")) === secrets(await readFile(backupEnv, "utf8"));
        if (!same) await copyFile(backupEnv, path.join(o.projectDir, ".env.from-backup"));
        envNote = same ? "same" : "differs";
      }
    }

    return { manifest, tables: restored, skippedTables, filesRestored: restoreFiles, previousStorage, envNote };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
