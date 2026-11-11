// เปิดระบบแบบออนไลน์ผ่าน Cloudflare Tunnel (โหมด production)
//  - ไม่มี CLOUDFLARE_TUNNEL_TOKEN ใน .env → Quick Tunnel (URL สุ่ม *.trycloudflare.com เปลี่ยนทุกครั้ง)
//  - มี CLOUDFLARE_TUNNEL_TOKEN + APP_URL → Named Tunnel (URL ถาวรตามโดเมนของคุณ)
import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, readdirSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT = 3000;
const children = [];

const log = (m) => console.log(`\x1b[36m[online]\x1b[0m ${m}`);
const die = (m) => {
  console.error(`\x1b[31m[online] ${m}\x1b[0m`);
  shutdown(1);
};

function shutdown(code = 0) {
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 1500);
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

const portOpen = (port) =>
  new Promise((ok) => {
    const s = createConnection({ port, host: "127.0.0.1" }, () => (s.end(), ok(true)));
    s.on("error", () => ok(false));
  });

async function waitFor(fn, ms, label) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  die(`รอ ${label} นานเกินไป`);
}

function newestMtime(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return t;
}

function findCloudflared() {
  const local = path.join(homedir(), ".local/bin/cloudflared");
  if (existsSync(local)) return local;
  return spawnSync("which", ["cloudflared"]).stdout?.toString().trim() || die("ไม่พบ cloudflared");
}

// 1) ฐานข้อมูล
if (!(await portOpen(5432))) {
  log("เปิดฐานข้อมูล…");
  children.push(spawn(process.execPath, ["scripts/local-db.mjs"], { cwd: ROOT, stdio: "ignore" }));
  await waitFor(() => portOpen(5432), 60_000, "ฐานข้อมูล");
}
if (await portOpen(PORT)) die(`พอร์ต ${PORT} ถูกใช้อยู่ — ปิดโปรแกรมที่เปิดค้างไว้ก่อน (เช่น หน้าต่าง "เริ่มโปรแกรม")`);

// 2) build เมื่อโค้ดเปลี่ยน
const buildId = path.join(ROOT, ".next/BUILD_ID");
const srcTime = Math.max(newestMtime(path.join(ROOT, "src")), newestMtime(path.join(ROOT, "prisma")));
if (!existsSync(buildId) || statSync(buildId).mtimeMs < srcTime) {
  log("กำลัง build (ครั้งแรกหรือมีการแก้โค้ด ใช้เวลา ~1 นาที)…");
  const b = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  if (b.status !== 0) die("build ไม่สำเร็จ");
}

// 3) Tunnel
const cloudflared = findCloudflared();
const token = process.env.CLOUDFLARE_TUNNEL_TOKEN?.trim();
let publicUrl;

if (token) {
  publicUrl = process.env.APP_URL?.trim();
  if (!publicUrl?.startsWith("https://")) die("ใช้ Named Tunnel ต้องตั้ง APP_URL=https://<โดเมนของคุณ> ใน .env");
  log("เปิด Named Tunnel…");
  // ส่ง token ผ่าน env (ไม่ให้เห็นใน process list)
  const t = spawn(cloudflared, ["tunnel", "--no-autoupdate", "run"], { env: { ...process.env, TUNNEL_TOKEN: token }, stdio: ["ignore", "ignore", "pipe"] });
  children.push(t);
  t.stderr.on("data", (d) => /ERR|error/i.test(d) && process.stderr.write(d));
  t.on("exit", (c) => c && die(`cloudflared หยุดทำงาน (code ${c})`));
} else {
  log("เปิด Quick Tunnel (ไม่ต้องมีบัญชี)…");
  const t = spawn(cloudflared, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], { stdio: ["ignore", "ignore", "pipe"] });
  children.push(t);
  t.on("exit", (c) => die(`cloudflared หยุดทำงาน (code ${c})`));
  publicUrl = await new Promise((resolve) => {
    const timer = setTimeout(() => die("ไม่ได้รับ URL จาก Cloudflare (ตรวจอินเทอร์เน็ต)"), 60_000);
    t.stderr.on("data", (d) => {
      const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) clearTimeout(timer), resolve(m[0]);
    });
  });
}

// 4) โปรแกรม (production)
log(`เปิดโปรแกรมที่ ${publicUrl}`);
const app = spawn("npx", ["next", "start", "-p", String(PORT)], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, APP_URL: publicUrl, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
});
children.push(app);
app.on("exit", (c) => die(`โปรแกรมหยุดทำงาน (code ${c})`));
await waitFor(() => portOpen(PORT), 60_000, "โปรแกรม");

mkdirSync(path.join(ROOT, "storage"), { recursive: true });
writeFileSync(path.join(ROOT, "storage/public-url.txt"), publicUrl + "\n");

console.log(`
\x1b[32m════════════════════════════════════════════════════════════
  ระบบออนไลน์แล้ว
  ใช้งาน:        ${publicUrl}
  LINE Webhook:  ${publicUrl}/api/line/webhook
════════════════════════════════════════════════════════════\x1b[0m
${token ? "" : "  * Quick Tunnel: URL จะเปลี่ยนทุกครั้งที่เปิดใหม่ (LINE webhook ต้องอัปเดตตาม)\n"}  ปิดหน้าต่างนี้ หรือกด Ctrl+C เพื่อหยุดระบบ
`);
if (process.platform === "darwin" && !process.env.NO_OPEN) spawn("open", [publicUrl], { stdio: "ignore" });
