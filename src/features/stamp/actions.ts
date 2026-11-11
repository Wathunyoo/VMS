"use server";

import { decideStampByLink, StampError, type StampRequestView } from "@/application/stamp/stamp.usecase";
import { stampDeps } from "@/container";

export type StampActionResult = { ok: true; data: StampRequestView } | { ok: false; error: string };

export async function decideStampAction(
  token: string,
  decision: "APPROVE" | "REJECT",
  reason?: string,
): Promise<StampActionResult> {
  if (decision !== "APPROVE" && decision !== "REJECT") return { ok: false, error: "คำสั่งไม่ถูกต้อง" };
  try {
    return { ok: true, data: await decideStampByLink(String(token), decision, reason ? String(reason) : undefined, stampDeps) };
  } catch (e) {
    if (e instanceof StampError) return { ok: false, error: e.message };
    console.error("[stamp]", e);
    return { ok: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
  }
}
