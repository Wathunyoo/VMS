import type { LineWebhookEvent } from "@/application/host-line/host-line.types";
import { handleLineEvents } from "@/application/host-line/host-line.usecase";
import { hostLineWebhookDeps } from "@/container";
import { verifySignature } from "@/infrastructure/line/line-client";

/** Webhook จาก LINE Platform — ตั้งค่า URL นี้ใน LINE Developers Console: {APP_URL}/api/line/webhook */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-line-signature"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: { events?: unknown[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  await handleLineEvents(toEvents(body.events ?? []), hostLineWebhookDeps);
  return new Response("OK");
}

type RawEvent = {
  type?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

/** แปลงเฉพาะเหตุการณ์จากแชต 1:1 ที่ระบบใช้ — เหตุการณ์อื่นข้าม */
function toEvents(raw: unknown[]): LineWebhookEvent[] {
  const out: LineWebhookEvent[] = [];
  for (const r of raw as RawEvent[]) {
    const userId = r.source?.type === "user" ? r.source.userId : undefined;
    if (!userId) continue;
    if (r.type === "follow") out.push({ type: "follow", userId, replyToken: r.replyToken });
    else if (r.type === "unfollow") out.push({ type: "unfollow", userId });
    else if (r.type === "message" && r.message?.type === "text" && typeof r.message.text === "string") {
      out.push({ type: "text", userId, replyToken: r.replyToken, text: r.message.text.slice(0, 200) });
    }
  }
  return out;
}
