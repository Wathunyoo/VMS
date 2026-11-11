import "server-only";
import type { HostLineRepository } from "@/application/host-line/host-line.types";
import { visitingText } from "@/domain/visit/labels";
import { Prisma } from "@/generated/prisma/client";
import { prisma as rootPrisma } from "../db/prisma";
import { db } from "../db/tenant";

const select = {
  id: true,
  fullName: true,
  department: true,
  tenant: { select: { name: true, floor: true } },
  site: { select: { mode: true } },
  lineUserId: true,
  lineDisplayName: true,
  lineLinkedAt: true,
  lineLinkCode: true,
  lineLinkCodeExpiresAt: true,
} satisfies Prisma.HostSelect;

/**
 * orgId = องค์กรของแอดมินที่จัดการ (จำกัดทุก query)
 * orgId = null  = ใช้กับ LINE webhook เท่านั้น — ระบุองค์กรจากรหัสเชื่อมต่อ (unique ทั้งระบบ)
 */
export const prismaHostLineRepository = (orgId: string | null): HostLineRepository => {
  const prisma = (orgId ? db(orgId) : rootPrisma) as unknown as typeof rootPrisma;
  return {
  list: () =>
    prisma.host.findMany({
      where: { isActive: true },
      select,
      orderBy: [{ site: { name: "asc" } }, { tenant: { floor: "asc" } }, { fullName: "asc" }],
    }),

  findById: (id) => prisma.host.findUnique({ where: { id }, select }),

  findByValidCode: (code, now) =>
    prisma.host.findFirst({ where: { lineLinkCode: code, lineLinkCodeExpiresAt: { gt: now }, isActive: true }, select }),

  async setLinkCode(hostId, code, expiresAt) {
    try {
      await prisma.host.update({ where: { id: hostId }, data: { lineLinkCode: code, lineLinkCodeExpiresAt: expiresAt } });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false; // รหัสซ้ำ
      throw e;
    }
  },

  async link(hostId, userId, displayName, at) {
    return prisma.$transaction(async (tx) => {
      const { organizationId } = await tx.host.findUniqueOrThrow({ where: { id: hostId }, select: { organizationId: true } });
      // ย้ายการเชื่อมต่อเฉพาะภายในองค์กรเดียวกัน (คนเดียวเป็น Host ได้หลายองค์กร)
      const { count } = await tx.host.updateMany({
        where: { organizationId, lineUserId: userId, id: { not: hostId } },
        data: { lineUserId: null, lineDisplayName: null, lineLinkedAt: null },
      });
      await tx.host.update({
        where: { id: hostId },
        data: {
          lineUserId: userId,
          lineDisplayName: displayName,
          lineLinkedAt: at,
          lineLinkCode: null, // รหัสใช้ได้ครั้งเดียว
          lineLinkCodeExpiresAt: null,
        },
      });
      return count > 0;
    });
  },

  async unlink(hostId) {
    await prisma.host.update({
      where: { id: hostId },
      data: { lineUserId: null, lineDisplayName: null, lineLinkedAt: null, lineLinkCode: null, lineLinkCodeExpiresAt: null },
    });
  },

  async invitableByUserId(userId) {
    const rows = await prisma.host.findMany({
      where: {
        lineUserId: userId,
        isActive: true,
        site: { mode: { not: "FACTORY" } },
        organization: { status: { not: "SUSPENDED" } },
        OR: [{ tenantId: null }, { tenant: { isActive: true } }],
      },
      select: { id: true, fullName: true, site: { select: { name: true, mode: true } }, tenant: { select: { name: true, floor: true, unit: true } } },
      take: 5,
    });
    return rows.map((h) => ({ id: h.id, fullName: h.fullName, placeText: h.tenant ? visitingText(h.site.mode, h.tenant) : h.site.name }));
  },

  async unlinkByUserId(userId) {
    await prisma.host.updateMany({
      where: { lineUserId: userId },
      data: { lineUserId: null, lineDisplayName: null, lineLinkedAt: null },
    });
  },
};
};
