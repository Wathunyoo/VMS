import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * LINE Messaging API (LINE Notify ปิดบริการแล้วตั้งแต่ 31 มี.ค. 2025)
 * ตั้งค่าใน .env: LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET, LINE_OA_BASIC_ID
 */
const API_BASE = process.env.LINE_API_BASE ?? "https://api.line.me"; // override ได้เพื่อทดสอบ

export type LineMessage = Record<string, unknown>;

export function lineConfig() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  const secret = process.env.LINE_CHANNEL_SECRET?.trim();
  const basicId = process.env.LINE_OA_BASIC_ID?.trim(); // เช่น @123abcde
  return {
    canSend: !!token,
    canReceive: !!secret,
    basicId: basicId || null,
    addFriendUrl: basicId ? `https://line.me/R/ti/p/${encodeURIComponent(basicId)}` : null,
  };
}

async function call(path: string, body: unknown, retryKey?: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า");
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(retryKey ? { "X-Line-Retry-Key": retryKey } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`LINE API ${res.status}: ${detail}`);
  }
}

export function pushMessage(to: string, messages: LineMessage[]) {
  // X-Line-Retry-Key กันส่งซ้ำถ้ามีการ retry
  return call("/v2/bot/message/push", { to, messages }, randomUUID());
}

export function replyMessage(replyToken: string, messages: LineMessage[]) {
  return call("/v2/bot/message/reply", { replyToken, messages });
}

export async function getProfileName(userId: string): Promise<string | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const p = (await res.json()) as { displayName?: string };
    return p.displayName?.slice(0, 100) ?? null;
  } catch {
    return null;
  }
}

/** ตรวจ X-Line-Signature = base64(HMAC-SHA256(channelSecret, rawBody)) */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET?.trim();
  if (!secret || !signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("base64"));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
