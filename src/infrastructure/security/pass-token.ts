import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Dynamic QR payload — ข้อมูลสรุปที่เซ็นด้วย HMAC ป้องกันการปลอม QR
 * รูปแบบ: VMS1.<base64url(json)>.<sig>
 */
export interface PassTokenPayload {
  vid: string; // visit id
  pc: string; // pass code
  n: string; // ชื่อผู้ติดต่อ (ย่อ)
  in: number; // check-in epoch (sec)
  exp: number; // expected check-out epoch (sec) — 0 = ไม่จำกัดเวลา
}

const PREFIX = "VMS1";

function sign(body: string): string {
  const key = process.env.PASS_TOKEN_SECRET;
  if (!key) throw new Error("PASS_TOKEN_SECRET is not set");
  return createHmac("sha256", key).update(`${PREFIX}.${body}`).digest("base64url").slice(0, 22);
}

export function createPassToken(payload: PassTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${PREFIX}.${body}.${sign(body)}`;
}

export function verifyPassToken(token: string): PassTokenPayload | null {
  const [prefix, body, sig] = token.split(".");
  if (prefix !== PREFIX || !body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PassTokenPayload;
  } catch {
    return null;
  }
}
