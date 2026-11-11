"use server";

import { redirect } from "next/navigation";
import { addDirectory, createFirstSite, finishOnboarding, OnboardingError } from "@/application/onboarding/onboarding.usecase";
import { onboardingDeps } from "@/container";
import { requireStaff } from "@/infrastructure/auth/session";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function admin() {
  const user = await requireStaff({ allowOnboarding: true });
  if (user.role !== "ADMIN") redirect("/home");
  return user;
}

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof OnboardingError) return { ok: false, error: e.message };
    console.error("[onboarding]", e);
    return { ok: false, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" };
  }
}

export async function createSiteAction(input: { name: string; mode: string; maxStayHours: number | null }) {
  const user = await admin();
  const hours = input?.maxStayHours == null ? null : Number(input.maxStayHours);
  return run(() => createFirstSite(user, { name: String(input?.name ?? ""), mode: String(input?.mode ?? ""), maxStayHours: hours }, onboardingDeps(user.organizationId)));
}

export async function addDirectoryAction(text: { tenants: string; hosts: string; bays: string }) {
  const user = await admin();
  const cap = (s: unknown) => String(s ?? "").slice(0, 50_000);
  return run(() => addDirectory(user, { tenants: cap(text.tenants), hosts: cap(text.hosts), bays: cap(text.bays) }, onboardingDeps(user.organizationId)));
}

export async function finishAction(): Promise<Result<null>> {
  const user = await admin();
  const r = await run(() => finishOnboarding(user, onboardingDeps(user.organizationId)));
  if (!r.ok) return r;
  redirect("/home");
}
