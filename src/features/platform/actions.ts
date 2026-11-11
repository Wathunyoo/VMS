"use server";

import { approveInvoice, BillingError, recheckSlip, rejectInvoice } from "@/application/billing/billing.usecase";
import { platformDeps } from "@/container";
import { requirePlatformAdmin } from "@/infrastructure/auth/station";

type Result = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    if (e instanceof BillingError) return { ok: false, error: e.message };
    console.error("[platform-billing]", e);
    return { ok: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
  }
}

export async function approveInvoiceAction(id: string): Promise<Result> {
  const admin = await requirePlatformAdmin();
  return run(() => approveInvoice(admin.username, String(id), platformDeps()));
}

export async function rejectInvoiceAction(id: string, note: string): Promise<Result> {
  const admin = await requirePlatformAdmin();
  return run(() => rejectInvoice(admin.username, String(id), String(note ?? ""), platformDeps()));
}

export async function recheckSlipAction(id: string): Promise<Result> {
  await requirePlatformAdmin();
  return run(() => recheckSlip(String(id), platformDeps()));
}
