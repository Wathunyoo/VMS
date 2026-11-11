"use server";

import type { HostLineView } from "@/application/host-line/host-line.types";
import {
  createLinkCode,
  HostLineError,
  listHostsForLine,
  sendTestMessage,
  unlinkHostLine,
} from "@/application/host-line/host-line.usecase";
import { hostLineDeps } from "@/container";
import { requireAdmin } from "@/infrastructure/auth/session";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof HostLineError) return { ok: false, error: e.message };
    console.error("[host-line]", e);
    return { ok: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
  }
}

export async function listHostLineAction(): Promise<Result<HostLineView[]>> {
  const admin = await requireAdmin();
  return run(() => listHostsForLine(admin, hostLineDeps(admin.organizationId)));
}

export async function createLinkCodeAction(hostId: string) {
  const admin = await requireAdmin();
  return run(() => createLinkCode(admin, String(hostId), hostLineDeps(admin.organizationId)));
}

export async function unlinkHostAction(hostId: string) {
  const admin = await requireAdmin();
  return run(() => unlinkHostLine(admin, String(hostId), hostLineDeps(admin.organizationId)));
}

export async function sendTestAction(hostId: string) {
  const admin = await requireAdmin();
  return run(() => sendTestMessage(admin, String(hostId), hostLineDeps(admin.organizationId)));
}
