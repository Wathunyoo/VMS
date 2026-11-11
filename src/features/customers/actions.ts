"use server";

import { revalidatePath } from "next/cache";
import {
  createCustomer,
  CustomerError,
  resetCustomerAdmin,
  resumeCustomer,
  suspendCustomer,
  updateCustomerContract,
  type ContractInput,
} from "@/application/platform/customers.usecase";
import { customersDeps } from "@/container";
import { requirePlatformAdmin } from "@/infrastructure/auth/station";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    revalidatePath("/platform/customers");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof CustomerError) return { ok: false, error: e.message };
    console.error("[customers]", e);
    return { ok: false, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" };
  }
}

const str = (v: unknown) => (v == null ? "" : String(v));

const contract = (input: ContractInput | undefined): ContractInput => ({
  contactEmail: str(input?.contactEmail),
  pointLimit: Number(input?.pointLimit),
  contractEndsAt: str(input?.contractEndsAt),
  houseLimit: input?.houseLimit == null || input.houseLimit === ("" as unknown) ? null : Number(input.houseLimit),
  legalName: str(input?.legalName),
  taxId: str(input?.taxId),
  branch: str(input?.branch),
  address: str(input?.address),
});

export async function createCustomerAction(
  input: {
    name: string;
    slug: string;
    mode: string;
    adminUsername?: string;
    plan: string;
    trialDays?: number;
  } & ContractInput,
) {
  await requirePlatformAdmin();
  return run(() =>
    createCustomer(
      {
        name: str(input?.name),
        slug: str(input?.slug),
        mode: str(input?.mode),
        ...contract(input),
        adminUsername: str(input?.adminUsername),
        plan: str(input?.plan),
        trialDays: Number(input?.trialDays ?? 30),
      },
      customersDeps(),
    ),
  );
}

export async function updateCustomerContractAction(orgId: string, input: ContractInput) {
  await requirePlatformAdmin();
  return run(() => updateCustomerContract(str(orgId), contract(input), customersDeps()));
}

export async function suspendCustomerAction(orgId: string, slug: string) {
  await requirePlatformAdmin();
  return run(() => suspendCustomer(str(orgId), str(slug), customersDeps()));
}

export async function resumeCustomerAction(orgId: string) {
  await requirePlatformAdmin();
  return run(() => resumeCustomer(str(orgId), customersDeps()));
}

export async function resetCustomerAdminAction(orgId: string, username: string) {
  await requirePlatformAdmin();
  return run(() => resetCustomerAdmin(str(orgId), str(username), customersDeps()));
}
