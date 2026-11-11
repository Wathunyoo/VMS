import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * ลิงก์ "แจ้งแขก" ของลูกบ้าน/Host ที่ส่งทาง LINE — เซ็นด้วย HMAC และมีวันหมดอายุ
 * ผูกกับบัญชี LINE ที่ขอ (ถ้าผู้ดูแลยกเลิก/เปลี่ยนการเชื่อมต่อ ลิงก์เดิมใช้ไม่ได้ทันที)
 * รูปแบบ: MANAR1.<base64url(json)>.<sig>
 */
export interface ResidentTokenPayload {
  h: string; // host id
  u: string; // hash ย่อของ LINE userId
  exp: number; // epoch (sec)
}

const PREFIX = "MANAR1";

function sign(body: string): string {
  const key = process.env.PASS_TOKEN_SECRET;
  if (!key) throw new Error("PASS_TOKEN_SECRET is not set");
  return createHmac("sha256", key).update(`${PREFIX}.${body}`).digest("base64url").slice(0, 27);
}

export const lineUserTag = (lineUserId: string) => createHash("sha256").update(`line:${lineUserId}`).digest("base64url").slice(0, 12);

export function createResidentToken(hostId: string, lineUserId: string, expiresAt: Date): string {
  const body = Buffer.from(JSON.stringify({ h: hostId, u: lineUserTag(lineUserId), exp: Math.floor(expiresAt.getTime() / 1000) })).toString("base64url");
  return `${PREFIX}.${body}.${sign(body)}`;
}

/** คืน payload เมื่อลายเซ็นถูกและยังไม่หมดอายุ */
export function verifyResidentToken(token: string, now: Date): ResidentTokenPayload | null {
  const [prefix, body, sig, extra] = String(token).split(".");
  if (prefix !== PREFIX || !body || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ResidentTokenPayload;
    if (typeof p.h !== "string" || typeof p.u !== "string" || typeof p.exp !== "number") return null;
    return p.exp * 1000 > now.getTime() ? p : null;
  } catch {
    return null;
  }
}
