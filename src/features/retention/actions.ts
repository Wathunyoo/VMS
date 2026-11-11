"use server";

import type { PurgeCounts, PurgeLogView, RetentionPolicy } from "@/application/retention/retention.types";
import { listPurgeRuns, previewPurge, RetentionError, runPurge, updatePolicy } from "@/application/retention/retention.usecase";
import { retentionDeps } from "@/container";
import { requireAdmin } from "@/infrastructure/auth/session";

export interface RetentionOverview {
  policy: RetentionPolicy;
  preview: PurgeCounts;
  runs: PurgeLogView[];
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function overview(orgId: string): Promise<RetentionOverview> {
  const deps = retentionDeps(orgId);
  const [policy, preview, runs] = await Promise.all([deps.repo.getPolicy(), previewPurge(deps), listPurgeRuns(deps)]);
  return { policy, preview, runs };
}

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof RetentionError) return { ok: false, error: e.message };
    console.error("[retention]", e);
    return { ok: false, error: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
  }
}

export async function getRetentionOverview(): Promise<RetentionOverview> {
  const admin = await requireAdmin();
  return overview(admin.organizationId);
}

export async function savePolicyAction(policy: RetentionPolicy): Promise<Result<RetentionOverview>> {
  const admin = await requireAdmin();
  return run(async () => {
    await updatePolicy(
      {
        photoDays: Math.trunc(Number(policy.photoDays)),
        personalDataDays: Math.trunc(Number(policy.personalDataDays)),
        autoEnabled: Boolean(policy.autoEnabled),
      },
      admin.username,
      retentionDeps(admin.organizationId),
    );
    return overview(admin.organizationId);
  });
}

export async function runPurgeNowAction(): Promise<Result<{ result: PurgeCounts; overview: RetentionOverview }>> {
  const admin = await requireAdmin();
  return run(async () => {
    const result = await runPurge("MANUAL", retentionDeps(admin.organizationId), admin.username);
    return { result, overview: await overview(admin.organizationId) };
  });
}
