import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SlipStorage } from "@/application/billing/billing.types";

/** สลิปโอนเงิน — เก็บนอก public/ เปิดผ่าน /billing/slips/:invoiceId (ตรวจสิทธิ์) เท่านั้น */
const ROOT = path.join(process.cwd(), "storage", "slips");
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MIME: Record<string, string> = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));

export const localSlipStorage: SlipStorage = {
  async save(bytes, mime) {
    const month = new Date().toISOString().slice(0, 7);
    await mkdir(path.join(ROOT, month), { recursive: true });
    const rel = `${month}/${randomUUID()}.${EXT[mime]}`;
    await writeFile(path.join(ROOT, rel), bytes);
    return rel;
  },
  async read(rel) {
    const f = await readSlip(rel);
    return f && { data: new Uint8Array(f.data), mime: f.mime };
  },
};

export async function readSlip(rel: string): Promise<{ data: Buffer; mime: string } | null> {
  const m = /^(\d{4}-\d{2})\/([0-9a-f-]{36})\.(jpg|png|webp|pdf)$/.exec(rel);
  if (!m) return null;
  try {
    return { data: await readFile(path.join(ROOT, m[1], `${m[2]}.${m[3]}`)), mime: MIME[m[3]] };
  } catch {
    return null;
  }
}
