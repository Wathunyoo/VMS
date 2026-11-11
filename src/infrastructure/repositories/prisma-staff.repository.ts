import "server-only";
import type { OrganizationRepository, StaffRepository } from "@/application/auth/auth.types";
import { prisma } from "../db/prisma";
import { db } from "../db/tenant";

export const prismaOrganizationRepository: OrganizationRepository = {
  findBySlug: (slug) =>
    prisma.organization.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, status: true, trialEndsAt: true, onboardedAt: true },
    }),
};

/** ผู้ใช้ของแต่ละองค์กร — ทุก query ถูกจำกัดใน orgId */
export const prismaStaffRepository = (orgId: string): StaffRepository => {
  const staff = db(orgId).staffUser;
  return {
    findByUsername: (username) => staff.findFirst({ where: { username } }),
    findById: (id) => staff.findUnique({ where: { id } }),
    list: () => staff.findMany({ orderBy: [{ isActive: "desc" }, { role: "asc" }, { username: "asc" }] }),
    create: (data) => staff.create({ data: { ...data, organizationId: orgId } }),
    pointActive: async (pointId) => (await db(orgId).checkInPoint.count({ where: { id: pointId, revokedAt: null } })) > 0,

    async update(id, data) {
      await staff.update({ where: { id }, data });
    },

    async recordFailedLogin(id, lockUntil) {
      await staff.update({
        where: { id },
        data: lockUntil ? { failedLoginCount: 0, lockedUntil: lockUntil } : { failedLoginCount: { increment: 1 } },
      });
    },

    async recordSuccessfulLogin(id, at) {
      await staff.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: at } });
    },

    async unlock(id) {
      await staff.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null } });
    },

    async revokeSessions(userId, exceptSessionId) {
      // StaffSession ไม่มี organizationId — ยืนยันก่อนว่า userId อยู่ในองค์กรนี้
      if (!(await staff.count({ where: { id: userId } }))) return;
      await prisma.staffSession.deleteMany({
        where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      });
    },
  };
};
