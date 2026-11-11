import "server-only";
import type { CheckOutRepository, CheckOutVisitRecord } from "@/application/check-out/check-out.types";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db/prisma";
import { db } from "../db/tenant";

/** client ทั่วไปหรือ client ที่ผูกองค์กร — ใช้ร่วมกันใน repository นี้ */
type Client = typeof prisma;

const visitInclude = {
  site: { select: { name: true } },
  visitor: { select: { fullName: true, company: true, idType: true, idNumberMasked: true } },
  host: { select: { fullName: true, department: true } },
  tenant: { select: { name: true, floor: true, unit: true } },
  vehicle: { include: { loadingBay: { select: { code: true, name: true } } } },
  safetyCheck: { select: { highRiskWorks: true, workPermitId: true } },
} satisfies Prisma.VisitInclude;

type VisitRow = Prisma.VisitGetPayload<{ include: typeof visitInclude }>;

const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : Number(d));

function toRecord(v: VisitRow): CheckOutVisitRecord {
  return {
    id: v.id,
    passCode: v.passCode,
    status: v.status,
    mode: v.mode,
    siteName: v.site.name,
    visitor: v.visitor,
    facePhotoUrl: v.facePhotoUrl,
    idCardPhotoUrl: v.idCardPhotoUrl,
    host: v.host,
    tenant: v.tenant,
    purpose: v.purpose,
    checkInAt: v.checkInAt,
    expectedCheckOutAt: v.expectedCheckOutAt,
    checkOutAt: v.checkOutAt,
    timeSpentMinutes: v.timeSpentMinutes,
    overstayMinutes: v.overstayMinutes,
    stampStatus: v.stampStatus,
    stampedAt: v.stampedAt,
    stampOtpHash: v.stampOtpHash,
    stampOtpExpiresAt: v.stampOtpExpiresAt,
    stampOtpAttempts: v.stampOtpAttempts,
    vehicle: v.vehicle
      ? {
          plateNumber: v.vehicle.plateNumber,
          plateProvince: v.vehicle.plateProvince,
          vehicleType: v.vehicle.vehicleType,
          loadingBay: v.vehicle.loadingBay ? `${v.vehicle.loadingBay.code} ${v.vehicle.loadingBay.name}` : null,
          weightInKg: num(v.vehicle.weightInKg),
          weightOutKg: num(v.vehicle.weightOutKg),
        }
      : null,
    safety: v.safetyCheck,
  };
}

async function decideStamp(
  client: Client,
  id: string,
  stampStatus: "APPROVED" | "REJECTED",
  event: "STAMP_APPROVED" | "STAMP_REJECTED",
  at: Date,
  by: string | undefined,
  payload: Record<string, string>,
  method?: "OTP" | "MANUAL" | "WEB_LINK",
): Promise<boolean> {
  return client.$transaction(async (tx) => {
    const { count } = await tx.visit.updateMany({
      where: { id, stampStatus: "PENDING", status: "CHECKED_IN" },
      data: {
        stampStatus,
        stampMethod: method,
        stampedAt: at,
        stampedBy: by,
        stampOtpHash: null, // OTP ใช้ไม่ได้อีกหลังตัดสินแล้ว
      },
    });
    if (count === 0) return false;
    const { organizationId } = await tx.visit.findUniqueOrThrow({ where: { id }, select: { organizationId: true } });
    await tx.visitEvent.create({ data: { organizationId, visitId: id, type: event, actor: by, payload } });
    return true;
  });
}

/** Repository ของการ check-out — ทุก query ถูกจำกัดอยู่ในองค์กร orgId */
export const prismaCheckOutRepository = (orgId: string): CheckOutRepository => {
  const prisma = db(orgId) as unknown as Client;
  return {
  async findById(id) {
    const v = await prisma.visit.findUnique({ where: { id }, include: visitInclude });
    return v && toRecord(v);
  },

  async findByPassCode(passCode) {
    const v = await prisma.visit.findFirst({ where: { passCode }, include: visitInclude });
    return v && toRecord(v);
  },

  async listActive() {
    const rows = await prisma.visit.findMany({
      where: { status: "CHECKED_IN" },
      include: visitInclude,
      orderBy: { checkInAt: "asc" },
      take: 200,
    });
    return rows.map(toRecord);
  },

  async findByStampToken(token) {
    const v = await prisma.visit.findUnique({ where: { stampToken: token }, include: visitInclude });
    return v && toRecord(v);
  },

  async approveStamp(id, method, at, by, note) {
    return decideStamp(prisma, id, "APPROVED", "STAMP_APPROVED", at, by, { method, ...(note ? { note } : {}) }, method);
  },

  async rejectStamp(id, at, by, reason) {
    return decideStamp(prisma, id, "REJECTED", "STAMP_REJECTED", at, by, reason ? { reason } : {});
  },

  async recordFailedOtp(id) {
    const v = await prisma.visit.update({
      where: { id },
      data: { stampOtpAttempts: { increment: 1 } },
      select: { stampOtpAttempts: true },
    });
    return v.stampOtpAttempts;
  },

  async completeCheckOut(id, d) {
    return prisma.$transaction(async (tx) => {
      // เงื่อนไข status ป้องกันการ check-out ซ้ำจาก 2 จุดพร้อมกัน
      const { count } = await tx.visit.updateMany({
        where: { id, status: "CHECKED_IN" },
        data: {
          status: "CHECKED_OUT",
          checkOutAt: d.checkOutAt,
          timeSpentMinutes: d.timeSpentMinutes,
          overstayMinutes: d.overstayMinutes,
          checkedOutBy: d.checkedOutBy,
        },
      });
      if (count === 0) return false;

      if (d.weightOutKg != null) {
        await tx.vehicleInfo.update({ where: { visitId: id }, data: { weightOutKg: d.weightOutKg } });
      }

      await tx.visitEvent.createMany({
        data: [
          ...(d.overstayMinutes > 0
            ? [
                {
                  organizationId: orgId,
                  visitId: id,
                  type: "OVERSTAY_ALERT" as const,
                  actor: d.checkedOutBy,
                  payload: { minutes: d.overstayMinutes },
                },
              ]
            : []),
          {
            organizationId: orgId,
            visitId: id,
            type: "CHECK_OUT" as const,
            actor: d.checkedOutBy,
            payload: { timeSpentMinutes: d.timeSpentMinutes },
          },
        ],
      });
      return true;
    });
  },
  };
};

/**
 * สำหรับหน้า E-Stamp ของ Host เท่านั้น — ค้นด้วย stampToken (สุ่ม 192 bit, unique ทั้งระบบ)
 * ซึ่งเป็นหลักฐานสิทธิ์อยู่แล้ว จึงไม่ผูกองค์กร; เปิดให้ใช้เฉพาะ 3 method นี้
 */
export type StampTokenRepository = Pick<CheckOutRepository, "findByStampToken" | "approveStamp" | "rejectStamp">;

export const stampTokenRepository: StampTokenRepository = {
  async findByStampToken(token) {
    const v = await prisma.visit.findUnique({ where: { stampToken: token }, include: visitInclude });
    return v && toRecord(v);
  },
  approveStamp: (id, method, at, by, note) =>
    decideStamp(prisma, id, "APPROVED", "STAMP_APPROVED", at, by, { method, ...(note ? { note } : {}) }, method),
  rejectStamp: (id, at, by, reason) => decideStamp(prisma, id, "REJECTED", "STAMP_REJECTED", at, by, reason ? { reason } : {}),
};
