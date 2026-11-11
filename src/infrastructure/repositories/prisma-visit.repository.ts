import "server-only";
import { CheckInError } from "@/application/check-in/check-in.usecase";
import type { VisitRepository } from "@/application/ports";
import { UNNAMED_VISITOR } from "@/domain/form/form-config";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db/tenant";
import { organizationMode } from "./org-mode";

/** Repository ของการ check-in — ทุก query ถูกจำกัดอยู่ในองค์กร orgId */
export const prismaVisitRepository = (orgId: string): VisitRepository => {
  const prisma = db(orgId);
  return {
  async recordNotification(visitId, result) {
    await prisma.visitEvent.create({
      data: {
        organizationId: orgId,
        visitId,
        type: "HOST_NOTIFIED",
        payload: {
          channel: result.channel,
          ok: result.ok,
          ...(result.kind ? { kind: result.kind } : {}),
          ...(result.error ? { error: result.error } : {}),
        },
      },
    });
  },

  async getSitePolicy(siteId) {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, mode: true, defaultMaxStayMinutes: true, inductionVersion: true },
    });
    return site && { ...site, orgMode: await organizationMode(orgId) };
  },

  async isBlacklisted(idType, idNumberHash) {
    const v = await prisma.visitor.findUnique({
      where: { organizationId_idType_idNumberHash: { organizationId: orgId, idType, idNumberHash } },
      select: { isBlacklisted: true },
    });
    return v?.isBlacklisted ?? false;
  },

  async createCheckIn(r) {
    const { input: d } = r;

    return prisma.$transaction(async (tx) => {
      // อ้างอิงข้ามองค์กรไม่ได้ — FK ของ DB ไม่รู้จักองค์กร จึงต้องตรวจเองก่อนเขียน
      await assertSameOrg(tx, d);

      const visitor = await tx.visitor.upsert({
        where: { organizationId_idType_idNumberHash: { organizationId: orgId, idType: d.idType, idNumberHash: r.idNumberHash } },
        create: {
          organizationId: orgId,
          fullName: d.fullName || UNNAMED_VISITOR,
          company: d.company,
          phone: d.phone,
          idType: d.idType,
          idNumberHash: r.idNumberHash,
          idNumberMasked: r.idNumberMasked,
          pdpaConsentAt: r.checkInAt,
        },
        // ไม่ได้กรอกชื่อครั้งนี้ → คงชื่อเดิมไว้
        update: { ...(d.fullName ? { fullName: d.fullName } : {}), company: d.company, phone: d.phone, pdpaConsentAt: r.checkInAt },
      });

      // Office: ถ้าเลือก Host แต่ไม่ได้เลือก Tenant ให้ดึง tenant ของ host มาใส่
      const host = d.hostId
        ? await tx.host.findUnique({
            where: { id: d.hostId },
            select: { fullName: true, email: true, phone: true, tenantId: true, lineUserId: true },
          })
        : null;

      const visit = await tx.visit.create({
        data: {
          organizationId: orgId,
          passCode: r.passCode,
          badgeNumber: d.badgeNumber,
          siteId: d.siteId,
          mode: d.mode,
          visitorId: visitor.id,
          hostId: d.hostId,
          tenantId: d.tenantId ?? host?.tenantId ?? undefined,
          purpose: d.purpose,
          purposeNote: d.purposeNote,
          customValues: r.customValues.length ? (r.customValues as unknown as Prisma.InputJsonValue) : undefined,
          status: "CHECKED_IN",
          facePhotoUrl: r.facePhotoUrl,
          idCardPhotoUrl: r.idCardPhotoUrl,
          checkInAt: r.checkInAt,
          expectedCheckOutAt: r.expectedCheckOutAt,
          checkedInBy: r.checkedInBy,
          stampStatus: r.stamp ? "PENDING" : "NOT_REQUIRED",
          stampToken: r.stamp?.token,
          stampOtpHash: r.stamp?.otpHash,
          stampOtpExpiresAt: r.stamp?.otpExpiresAt,

          safetyCheck:
            d.mode === "FACTORY"
              ? {
                  create: {
                    organizationId: orgId,
                    ppeHelmet: d.ppeHelmet,
                    ppeSafetyShoes: d.ppeSafetyShoes,
                    ppeReflectiveVest: d.ppeReflectiveVest,
                    ppeSafetyGlasses: d.ppeSafetyGlasses,
                    ppeEarProtection: d.ppeEarProtection,
                    ppeGloves: d.ppeGloves,
                    highRiskWorks: d.highRiskWorks,
                    workPermitId: d.workPermitId,
                    inductionCompleted: d.inductionCompleted,
                    inductionVersion: r.inductionVersion,
                    inductionAckAt: d.inductionCompleted ? r.checkInAt : null,
                  },
                }
              : undefined,

          vehicle:
            d.hasVehicle && d.plateNumber && d.vehicleType
              ? {
                  create: {
                    organizationId: orgId,
                    plateNumber: d.plateNumber.replace(/\s+/g, " ").toUpperCase(),
                    plateProvince: d.plateProvince,
                    vehicleType: d.vehicleType,
                    platePhotoUrl: r.platePhotoUrl,
                    driverName: d.driverName,
                    loadingBayId: d.mode === "FACTORY" ? d.loadingBayId : undefined,
                    cargoDescription: d.cargoDescription,
                    sealNumber: d.sealNumber,
                    weightInKg: d.weightInKg,
                  },
                }
              : undefined,

          events: {
            create: [
              { organizationId: orgId, type: "CHECK_IN", actor: r.checkedInBy },
              ...(r.stamp ? [{ organizationId: orgId, type: "STAMP_REQUESTED" as const, actor: r.checkedInBy }] : []),
            ],
          },
        },
        select: { id: true, tenantId: true },
      });

      // แขกที่แจ้งล่วงหน้า: ใช้ได้ครั้งเดียว — ตรวจสถานะอีกครั้งใน transaction กันสแกนซ้ำพร้อมกัน 2 จุด
      let household: { fullName: string; email: string | null; phone: string | null; lineUserId: string | null }[] = [];
      if (r.inviteId) {
        const { count } = await tx.guestInvite.updateMany({
          where: { id: r.inviteId, status: "ACTIVE" },
          data: { status: "USED", usedAt: r.checkInAt, visitId: visit.id },
        });
        if (count === 0) throw new CheckInError("QR นี้ถูกใช้ Check-in ไปแล้ว");
        household = await tx.host.findMany({
          where: {
            isActive: true,
            lineUserId: { not: null },
            ...(visit.tenantId ? { tenantId: visit.tenantId } : { id: d.hostId ?? "-" }),
          },
          select: { fullName: true, email: true, phone: true, lineUserId: true },
          take: 20,
        });
      }

      return {
        visitId: visit.id,
        hostContact: host
          ? { fullName: host.fullName, email: host.email, phone: host.phone, lineUserId: host.lineUserId }
          : null,
        household,
      };
    });
  },
  };
};

type Tx = Parameters<Parameters<ReturnType<typeof db>["$transaction"]>[0]>[0];

async function assertSameOrg(
  tx: Tx,
  d: { siteId: string; hostId?: string; tenantId?: string; loadingBayId?: string },
) {
  const [site, host, tenant, bay] = await Promise.all([
    tx.site.count({ where: { id: d.siteId } }),
    d.hostId ? tx.host.count({ where: { id: d.hostId, siteId: d.siteId } }) : 1,
    d.tenantId ? tx.tenant.count({ where: { id: d.tenantId, siteId: d.siteId } }) : 1,
    d.loadingBayId ? tx.loadingBay.count({ where: { id: d.loadingBayId, siteId: d.siteId } }) : 1,
  ]);
  if (!site || !host || !tenant || !bay) throw new CheckInError("ข้อมูลสถานที่/ผู้รับพบไม่ถูกต้อง กรุณาโหลดหน้าใหม่");
}
