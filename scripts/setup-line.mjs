// ตั้งค่า LINE Messaging API ลงใน .env — ถามทีละค่า ตรวจกับ LINE แล้วบันทึก
// ดับเบิลคลิก "ตั้งค่า LINE.command" หรือ: node scripts/setup-line.mjs
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ENV = path.join(ROOT, ".env");
const c = (n, s) => `\x1b[${n}m${s}\x1b[0m`;

// readline ตัวเดียวตลอดการทำงาน — ค่าลับแสดงเป็น • แทนตัวอักษรจริง
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY ?? false });
let hide = false;
let prompt = "";
rl._writeToOutput = (s) => {
  if (!hide || s.includes(prompt) || s === "\r\n" || s === "\n") rl.output.write(s);
  else rl.output.write("•");
};
const lines = rl[Symbol.asyncIterator]();
async function ask(question, hidden = false) {
  hide = hidden;
  prompt = question;
  rl.output.write(question);
  const { value, done } = await lines.next();
  hide = false;
  if (hidden && process.stdin.isTTY) rl.output.write("\n");
  if (done) {
    console.log(c(31, "\nยกเลิก — ไม่มีการเปลี่ยนแปลง"));
    process.exit(1);
  }
  return String(value).trim();
}

function setEnv(text, key, value) {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(text) ? text.replace(re, line) : `${text.replace(/\n*$/, "\n")}${line}\n`;
}

console.log(c(1, "\nตั้งค่า LINE สำหรับระบบ VMS"));
console.log("คัดลอกค่าจาก https://developers.line.biz/console → เลือก channel ของ OA\n");

let secret;
for (;;) {
  secret = await ask("1) Channel secret (แท็บ Basic settings): ", true);
  if (/^[0-9a-f]{32}$/i.test(secret)) break;
  console.log(c(31, "   ไม่ถูกต้อง — Channel secret เป็นตัวอักษร 0-9 a-f ยาว 32 ตัว ลองวางใหม่"));
}

let token, info;
for (;;) {
  token = await ask("2) Channel access token (แท็บ Messaging API → long-lived): ", true);
  if (token.length < 100) {
    console.log(c(31, "   สั้นเกินไป — ตรวจว่าคัดลอกครบทั้งหมด (ยาวมากกว่า 100 ตัว)"));
    continue;
  }
  process.stdout.write("   กำลังตรวจกับ LINE… ");
  try {
    const r = await fetch("https://api.line.me/v2/bot/info", { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      info = await r.json();
      console.log(c(32, `ใช้ได้ ✓  (${info.displayName} · ${info.basicId})`));
      break;
    }
    console.log(c(31, `ไม่ผ่าน (${r.status}) — token ไม่ถูกต้องหรือถูกยกเลิก ลองออก token ใหม่แล้ววางอีกครั้ง`));
  } catch (e) {
    console.log(c(33, `เชื่อมต่อ LINE ไม่ได้ (${e.message}) — บันทึกไว้ก่อน ตรวจภายหลัง`));
    break;
  }
}

let basicId = info?.basicId ?? "";
if (!basicId) {
  basicId = await ask("3) Bot basic ID (ขึ้นต้นด้วย @): ");
}
if (basicId && !basicId.startsWith("@")) basicId = `@${basicId}`;

let text = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
if (existsSync(ENV)) copyFileSync(ENV, `${ENV}.before-line`);
text = setEnv(text, "LINE_CHANNEL_SECRET", secret);
text = setEnv(text, "LINE_CHANNEL_ACCESS_TOKEN", token);
text = setEnv(text, "LINE_OA_BASIC_ID", basicId);
writeFileSync(ENV, text, { mode: 0o600 });

console.log(c(32, "\nบันทึกแล้ว ✓"));
console.log(`  LINE OA: ${basicId || "-"}`);
console.log("  (ไฟล์ .env เดิมสำรองไว้ที่ .env.before-line)");
console.log("\nขั้นต่อไป: ดับเบิลคลิก “เปิดระบบออนไลน์.command” แล้วนำ URL ที่ได้ไปตั้ง Webhook ใน LINE Developers");
if (process.stdin.isTTY) {
  console.log("\nกด Enter เพื่อปิดหน้าต่างนี้");
  await ask("");
}
rl.close();
