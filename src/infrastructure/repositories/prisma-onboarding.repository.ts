import "server-only";
import type { OnboardingRepository } from "@/application/onboarding/onboarding.usecase";
import { prisma } from "../db/prisma";
import { db } from "../db/tenant";
import { readHouseQuota } from "./house-quota";

export const prismaOnboardingRepository = (orgId: string): OnboardingRepository => {
  const t = db(orgId);
  return {
    async status() {
      const [siteCount, hostCount, tenantCount, org, firstSite] = await Promise.all([
        t.site.count(),
        t.host.count(),
        t.tenant.count(),
        prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { onboardedAt: true, siteMode: true } }),
        t.site.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, mode: true, name: true } }),
      ]);
      return { siteCount, hostCount, tenantCount, orgMode: org.siteMode, onboarded: !!org.onboardedAt, firstSite };
    },

    async createSite(s) {
      // โหมดที่เลือกครั้งแรก = โหมดขององค์กร (เปลี่ยนภายหลังไม่ได้)
      return prisma.$transaction(async (tx) => {
        const site = await tx.site.create({ data: { ...s, organizationId: orgId } });
        await tx.organization.update({ where: { id: orgId }, data: { siteMode: s.mode } });
        return site.id;
      });
    },

    async addDirectory(siteId, d) {
      return t.$transaction(async (tx) => {
        const tenantIds = new Map<string, string>();
        for (const x of d.tenants) {
          const tenant = await tx.tenant.create({ data: { organizationId: orgId, siteId, name: x.name, floor: x.floor } });
          tenantIds.set(x.name.toLowerCase(), tenant.id);
        }
        // Host ที่ระบุบริษัท: ผูกกับผู้เช่าที่เพิ่งเพิ่ม หรือที่มีอยู่แล้วในสถานที่นี้
        const existing = await tx.tenant.findMany({ where: { siteId }, select: { id: true, name: true } });
        for (const e of existing) if (!tenantIds.has(e.name.toLowerCase())) tenantIds.set(e.name.toLowerCase(), e.id);
        if (d.hosts.length) {
          await tx.host.createMany({
            data: d.hosts.map((h) => ({
              organizationId: orgId,
              siteId,
              fullName: h.fullName,
              department: h.department,
              tenantId: h.tenantName ? (tenantIds.get(h.tenantName.toLowerCase()) ?? null) : null,
            })),
          });
        }
        if (d.bays.length) {
          await tx.loadingBay.createMany({
            data: d.bays.map((b) => ({ organizationId: orgId, siteId, code: b.code, name: b.name })),
            skipDuplicates: true,
          });
        }
        return { tenants: d.tenants.length, hosts: d.hosts.length, bays: d.bays.length };
      });
    },

    houseQuota: () => readHouseQuota(orgId),

    async finish(at) {
      await prisma.organization.update({ where: { id: orgId }, data: { onboardedAt: at } });
    },
  };
};
