import "server-only";
import type { RetentionRepository } from "@/application/retention/retention.types";
import { Prisma } from "@/generated/prisma/client";
import { prisma as rootPrisma } from "../db/prisma";
import { db } from "../db/tenant";

export const ANONYMIZED_NAME = "ผู้ติดต่อ (ลบข้อมูลแล้ว)";
const ANON = "—";

/** การเข้าพื้นที่ที่จบแล้ว (ไม่ใช่ CHECKED_IN) และสิ้นสุดก่อน cutoff */
const endedBefore = (cutoff: Date): Prisma.VisitWhereInput => ({
  status: { not: "CHECKED_IN" },
  OR: [{ checkOutAt: { lt: cutoff } }, { checkOutAt: null, checkInAt: { lt: cutoff } }],
});

/** ผู้ติดต่อที่ไม่มีการเข้าพื้นที่ใหม่กว่า cutoff, ไม่ได้อยู่ในพื้นที่ และไม่อยู่ใน blacklist */
const visitorDue = (cutoff: Date): Prisma.VisitorWhereInput => ({
  purgedAt: null,
  isBlacklisted: false,
  createdAt: { lt: cutoff },
  visits: {
    none: {
      OR: [
        { status: "CHECKED_IN" },
        { checkOutAt: { gte: cutoff } },
        { checkOutAt: null, checkInAt: { gte: cutoff } },
      ],
    },
  },
});

const vehicleDue = (cutoff: Date): Prisma.VehicleInfoWhereInput => ({
  visit: endedBefore(cutoff),
  OR: [{ plateNumber: { not: ANON } }, { driverName: { not: null } }],
});

// หมายเหตุ + ช่องที่องค์กรเพิ่มเอง (อาจมีข้อมูลส่วนบุคคล) ลบพร้อมข้อมูลส่วนบุคคล
const visitNoteDue = (cutoff: Date): Prisma.VisitWhereInput => ({
  AND: [endedBefore(cutoff), { OR: [{ purposeNote: { not: null } }, { customValues: { not: Prisma.DbNull } }] }],
});

/** นโยบายและการลบข้อมูลขององค์กร orgId — ทุก query ถูกจำกัดในองค์กร */
export const prismaRetentionRepository = (orgId: string): RetentionRepository => {
  const prisma = db(orgId) as unknown as typeof rootPrisma;
  return {
  async getPolicy() {
    const s = await prisma.retentionSetting.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId },
      update: {},
    });
    return { photoDays: s.photoDays, personalDataDays: s.personalDataDays, autoEnabled: s.autoEnabled };
  },

  async savePolicy(p, by) {
    await prisma.retentionSetting.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, ...p, updatedBy: by },
      update: { ...p, updatedBy: by },
    });
  },

  async findExpiredPhotos(cutoff, limit) {
    const [visits, idcards, vehicles] = await Promise.all([
      prisma.visit.findMany({
        where: { ...endedBefore(cutoff), facePhotoUrl: { not: null } },
        select: { id: true, facePhotoUrl: true },
        take: limit,
      }),
      prisma.visit.findMany({
        where: { ...endedBefore(cutoff), idCardPhotoUrl: { not: null } },
        select: { id: true, idCardPhotoUrl: true },
        take: limit,
      }),
      prisma.vehicleInfo.findMany({
        where: { visit: endedBefore(cutoff), platePhotoUrl: { not: null } },
        select: { id: true, platePhotoUrl: true },
        take: limit,
      }),
    ]);
    return [
      ...visits.map((v) => ({ kind: "visit" as const, id: v.id, url: v.facePhotoUrl! })),
      ...idcards.map((v) => ({ kind: "idcard" as const, id: v.id, url: v.idCardPhotoUrl! })),
      ...vehicles.map((v) => ({ kind: "vehicle" as const, id: v.id, url: v.platePhotoUrl! })),
    ].slice(0, limit);
  },

  async clearPhotoRefs(refs) {
    const visitIds = refs.filter((r) => r.kind === "visit").map((r) => r.id);
    const vehicleIds = refs.filter((r) => r.kind === "vehicle").map((r) => r.id);
    const idcardIds = refs.filter((r) => r.kind === "idcard").map((r) => r.id);
    await prisma.$transaction([
      prisma.visit.updateMany({ where: { id: { in: visitIds } }, data: { facePhotoUrl: null } }),
      prisma.visit.updateMany({ where: { id: { in: idcardIds } }, data: { idCardPhotoUrl: null } }),
      prisma.vehicleInfo.updateMany({ where: { id: { in: vehicleIds } }, data: { platePhotoUrl: null } }),
    ]);
  },

  async countExpiredPhotos(cutoff) {
    const [a, b, c] = await Promise.all([
      prisma.visit.count({ where: { ...endedBefore(cutoff), facePhotoUrl: { not: null } } }),
      prisma.visit.count({ where: { ...endedBefore(cutoff), idCardPhotoUrl: { not: null } } }),
      prisma.vehicleInfo.count({ where: { visit: endedBefore(cutoff), platePhotoUrl: { not: null } } }),
    ]);
    return a + b + c;
  },

  async anonymizePersonalData(cutoff, at) {
    return prisma.$transaction(async (tx) => {
      const vehicles = await tx.vehicleInfo.updateMany({
        where: vehicleDue(cutoff),
        data: { plateNumber: ANON, plateProvince: null, driverName: null },
      });
      const visits = await tx.visit.updateMany({ where: visitNoteDue(cutoff), data: { purposeNote: null, customValues: Prisma.DbNull } });
      // แจ้งแขกล่วงหน้า (ชื่อแขก/ทะเบียนรถ) — ลบเมื่อหมดเวลาเกินระยะเก็บข้อมูลส่วนบุคคล
      await tx.guestInvite.deleteMany({ where: { validUntil: { lt: cutoff } } });

      const due = await tx.visitor.findMany({ where: visitorDue(cutoff), select: { id: true } });
      const ids = due.map((v) => v.id);
      if (ids.length > 0) {
        // hash เลขบัตรเป็น pseudonymous data — แทนด้วยค่าไม่ซ้ำที่ย้อนกลับไม่ได้ (ต้อง unique ตาม constraint)
        await tx.$executeRaw`
          UPDATE "Visitor" SET
            "fullName" = ${ANONYMIZED_NAME}, "company" = NULL, "phone" = NULL, "email" = NULL,
            "idNumberMasked" = ${ANON}, "idNumberHash" = 'purged:' || "id",
            "purgedAt" = ${at}, "updatedAt" = ${at}
          WHERE "id" = ANY(${ids}) AND "organizationId" = ${orgId}`;
      }
      return { visitorsAnonymized: ids.length, vehiclesAnonymized: vehicles.count, visitsCleaned: visits.count };
    });
  },

  async countPersonalDataDue(cutoff) {
    const [visitorsAnonymized, vehiclesAnonymized, visitsCleaned] = await Promise.all([
      prisma.visitor.count({ where: visitorDue(cutoff) }),
      prisma.vehicleInfo.count({ where: vehicleDue(cutoff) }),
      prisma.visit.count({ where: visitNoteDue(cutoff) }),
    ]);
    return { visitorsAnonymized, vehiclesAnonymized, visitsCleaned };
  },

  async logRun(e) {
    await prisma.dataPurgeLog.create({
      data: {
        organizationId: orgId,
        trigger: e.trigger,
        actor: e.actor,
        photoDays: e.policy.photoDays,
        personalDataDays: e.policy.personalDataDays,
        photosDeleted: e.photosDeleted,
        visitorsAnonymized: e.visitorsAnonymized,
        vehiclesAnonymized: e.vehiclesAnonymized,
        visitsCleaned: e.visitsCleaned,
        error: e.error,
      },
    });
  },

  listRuns: (limit) => prisma.dataPurgeLog.findMany({ orderBy: { ranAt: "desc" }, take: limit }),
};
};

/** รายชื่อองค์กรที่ต้องรันการลบอัตโนมัติ (ไม่รวมองค์กรที่ถูกระงับ) */
export async function listOrganizationsForRetention(): Promise<{ id: string; slug: string }[]> {
  return rootPrisma.organization.findMany({ where: { status: { not: "SUSPENDED" } }, select: { id: true, slug: true } });
}
