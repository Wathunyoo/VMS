import "server-only";
import { prisma } from "./prisma";

/**
 * Prisma client ที่ผูกกับองค์กร — แยกข้อมูลลูกค้าแต่ละราย (multi-tenancy)
 *
 * ทุก query ระดับบนสุดของโมเดลที่มี organizationId จะถูกบังคับ:
 *  - อ่าน/แก้/ลบ  → เติม where.organizationId = orgId (ทับค่าที่ส่งมาเสมอ)
 *  - สร้าง        → เติม data.organizationId = orgId
 *
 * ข้อจำกัด: nested create (เช่น visit.create({ data: { vehicle: { create } } }))
 * ไม่ผ่าน extension — ต้องใส่ organizationId เองใน repository
 */
const TENANT_MODELS = new Set([
  "Site",
  "Tenant",
  "Host",
  "LoadingBay",
  "Visitor",
  "Visit",
  "FactorySafetyCheck",
  "VehicleInfo",
  "VisitEvent",
  "StaffUser",
  "RetentionSetting",
  "DataPurgeLog",
  "BillingProfile",
  "Invoice",
  "CheckInPoint",
  "FormSetting",
  "CustomField",
  "GuestInvite",
]);

const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

type Args = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
};

function scope(orgId: string) {
  return prisma.$extends({
    name: `tenant:${orgId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a = { ...(args as Args) };

          if (WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), organizationId: orgId };
          } else if (operation === "create") {
            a.data = { ...(a.data as Record<string, unknown>), organizationId: orgId };
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            const rows = Array.isArray(a.data) ? a.data : [a.data!];
            a.data = rows.map((r) => ({ ...r, organizationId: orgId }));
          } else if (operation === "upsert") {
            a.where = { ...(a.where ?? {}), organizationId: orgId };
            a.create = { ...(a.create ?? {}), organizationId: orgId };
          } else {
            throw new Error(`tenant scope: unsupported operation ${model}.${operation}`);
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof scope>;

const cache = new Map<string, TenantDb>();

/** Prisma client ขององค์กร (cache ต่อองค์กร) */
export function db(orgId: string): TenantDb {
  if (!orgId) throw new Error("tenant scope: organizationId is required");
  let client = cache.get(orgId);
  if (!client) {
    if (cache.size > 500) cache.clear();
    client = scope(orgId);
    cache.set(orgId, client);
  }
  return client;
}
