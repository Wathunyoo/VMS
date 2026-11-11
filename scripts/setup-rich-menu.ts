/**
 * ตั้งเมนูด้านล่างแชต (Rich Menu) ของ LINE OA — ปุ่ม "แจ้งแขก" และ "วิธีใช้"
 *   npm run line:richmenu -- --preview   สร้างรูปเมนูอย่างเดียว (docs/brand/มานะ-RichMenu.png) ไม่แตะ LINE
 *   npm run line:richmenu                 สร้างเมนู อัปโหลดรูป และตั้งเป็นเมนูหลักของทุกคน
 *   npm run line:richmenu -- --remove     ลบเมนูนี้ออก (กลับไปใช้เมนูที่ตั้งใน LINE OA Manager ถ้ามี)
 * ปุ่มส่งข้อความ "แจ้งแขก" / "วิธีใช้" แทนผู้ใช้ → ระบบตอบตามปกติ (ไม่ต้องตั้งค่าเพิ่ม)
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const NAME = "mana-main";
const W = 2500;
const H = 843;
const SPLIT = 1650; // ปุ่มซ้าย (แจ้งแขก) กว้างกว่า
const API = "https://api.line.me";
const API_DATA = "https://api-data.line.me";
const ROOT = path.resolve(import.meta.dirname, "..");

function token() {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!t) throw new Error("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN — ดับเบิลคลิก “ตั้งค่า LINE.command” ก่อน");
  return t;
}

async function call(method: string, url: string, body?: unknown, contentType = "application/json") {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token()}`, ...(body ? { "Content-Type": contentType } : {}) },
    body: body === undefined ? undefined : contentType === "application/json" ? JSON.stringify(body) : new Uint8Array(body as Buffer),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok && res.status !== 404) throw new Error(`LINE API ${res.status}: ${text.slice(0, 300)}`);
  return { status: res.status, json: text ? JSON.parse(text) : {} };
}

/** รูปเมนู 2500×843 — ซ้าย: แจ้งแขก (เขียว) · ขวา: วิธีใช้ (ขาว + โลโก้) */
async function renderImage(): Promise<Buffer> {
  const font = "Thonburi, 'Sukhumvit Set', 'Noto Sans Thai', Tahoma, sans-serif";
  // ไอคอน QR แบบง่าย
  const finder = (x: number, y: number) =>
    `<rect x="${x}" y="${y}" width="84" height="84" rx="10" fill="none" stroke="#fff" stroke-width="16"/><rect x="${x + 26}" y="${y + 26}" width="32" height="32" rx="4" fill="#fff"/>`;
  const qr = `<g transform="translate(150,281)">${finder(0, 0)}${finder(196, 0)}${finder(0, 196)}
    <rect x="196" y="196" width="34" height="34" fill="#fff"/><rect x="246" y="230" width="34" height="34" fill="#fff"/>
    <rect x="196" y="246" width="34" height="34" fill="#fff"/><rect x="130" y="130" width="34" height="34" fill="#fff"/>
    <rect x="130" y="40" width="34" height="34" fill="#fff"/><rect x="40" y="130" width="34" height="34" fill="#fff"/></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <rect width="${SPLIT}" height="${H}" fill="#16a34a"/>
    ${qr}
    <text x="560" y="420" font-family="${font}" font-size="190" font-weight="700" fill="#ffffff">แจ้งแขก</text>
    <text x="566" y="560" font-family="${font}" font-size="74" fill="#dcfce7">สร้าง QR ส่งให้แขกที่จะมาหา</text>
    <line x1="${SPLIT}" y1="0" x2="${SPLIT}" y2="${H}" stroke="#e5e7eb" stroke-width="6"/>
    <text x="${(SPLIT + W) / 2}" y="640" text-anchor="middle" font-family="${font}" font-size="110" font-weight="700" fill="#1f2937">วิธีใช้</text>
  </svg>`;
  const logo = await sharp(path.join(ROOT, "public/brand/mana-wordmark.png")).resize({ width: 600 }).png().toBuffer();
  const meta = await sharp(logo).metadata();
  return sharp(Buffer.from(svg))
    .composite([{ input: logo, left: Math.round((SPLIT + W) / 2 - (meta.width ?? 600) / 2), top: 200 }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function ourMenus(): Promise<string[]> {
  const { json } = await call("GET", `${API}/v2/bot/richmenu/list`);
  return ((json.richmenus ?? []) as { richMenuId: string; name: string }[]).filter((m) => m.name === NAME).map((m) => m.richMenuId);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const img = await renderImage();
  const preview = path.join(ROOT, "docs/brand/มานะ-RichMenu.png");
  await mkdir(path.dirname(preview), { recursive: true });
  await writeFile(preview, img);
  console.log(`รูปเมนู: ${path.relative(ROOT, preview)} (${Math.round(img.length / 1024)} KB)`);
  if (args.has("--preview")) return;

  if (args.has("--remove")) {
    const ids = await ourMenus();
    for (const id of ids) await call("DELETE", `${API}/v2/bot/richmenu/${id}`);
    console.log(ids.length ? `ลบเมนูแล้ว ${ids.length} รายการ` : "ไม่มีเมนูของระบบให้ลบ");
    return;
  }

  if (img.length > 1024 * 1024) throw new Error("รูปใหญ่เกิน 1 MB (ข้อกำหนดของ LINE)");
  const old = await ourMenus();
  const { json: created } = await call("POST", `${API}/v2/bot/richmenu`, {
    size: { width: W, height: H },
    selected: true, // เปิดเมนูไว้เมื่อเข้าแชต
    name: NAME,
    chatBarText: "เมนู · แจ้งแขก",
    areas: [
      { bounds: { x: 0, y: 0, width: SPLIT, height: H }, action: { type: "message", label: "แจ้งแขก", text: "แจ้งแขก" } },
      { bounds: { x: SPLIT, y: 0, width: W - SPLIT, height: H }, action: { type: "message", label: "วิธีใช้", text: "วิธีใช้" } },
    ],
  });
  const id = created.richMenuId as string;
  try {
    await call("POST", `${API_DATA}/v2/bot/richmenu/${id}/content`, img, "image/png");
    await call("POST", `${API}/v2/bot/user/all/richmenu/${id}`);
  } catch (e) {
    await call("DELETE", `${API}/v2/bot/richmenu/${id}`).catch(() => {});
    throw e;
  }
  // ลบเมนูรุ่นก่อนของระบบ (ไม่แตะเมนูอื่น)
  for (const o of old) await call("DELETE", `${API}/v2/bot/richmenu/${o}`);
  console.log(`ตั้งเมนูเรียบร้อย (${id})${old.length ? ` · ลบเมนูรุ่นก่อน ${old.length} รายการ` : ""}`);
  console.log("ปิดแล้วเปิดแชต LINE OA ใหม่เพื่อดูเมนู (อาจใช้เวลาสักครู่)");
}

main().catch((e) => {
  console.error("ไม่สำเร็จ:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
