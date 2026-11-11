import "server-only";
import type { CustomersRepository } from "@/application/platform/customers.usecase";
import { prisma } from "../db/prisma";

/** ลูกค้าทุกองค์กร — ใช้หลัง requirePlatformAdmin เท่านั้น */
export const prismaCustomersRepository: CustomersRepository = {
  async list() {
    const orgs = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        staffUsers: { where: { role: "ADMIN", isActive: true }, select: { username: true }, orderBy: { createdAt: "asc" } },
        _count: {
          select: {
            sites: true,
            checkInPoints: { where: { revokedAt: null } },
            tenants: { where: { isActive: true, site: { mode: "VILLAGE" } } },
          },
        },
        billingProfile: true,
      },
    });
    const last = await prisma.visit.groupBy({ by: ["organizationId"], _max: { checkInAt: true } });
    const lastBy = new Map(last.map((l) => [l.organizationId, l._max.checkInAt]));
    return orgs.map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      mode: o.siteMode,
      status: o.status,
      trialEndsAt: o.trialEndsAt,
      paidUntil: o.paidUntil,
      onboardedAt: o.onboardedAt,
      contactEmail: o.contactEmail,
      pointLimit: o.checkInPointLimit,
      activePoints: o._count.checkInPoints,
      houseLimit: o.houseLimit,
      activeHouses: o._count.tenants,
      contractEndsAt: o.contractEndsAt,
      billing: o.billingProfile
        ? { legalName: o.billingProfile.legalName, taxId: o.billingProfile.taxId, branch: o.billingProfile.branch, address: o.billingProfile.address, billingEmail: o.billingProfile.billingEmail }
        : null,
      createdAt: o.createdAt,
      admins: o.staffUsers.map((u) => u.username),
      sites: o._count.sites,
      lastVisitAt: lastBy.get(o.id) ?? null,
    }));
  },
  async slugTaken(slug) {
    return (await prisma.organization.count({ where: { slug } })) > 0;
  },
  async create(c) {
    return prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { slug: c.slug, name: c.name, siteMode: c.mode, contactEmail: c.contactEmail, status: c.status, trialEndsAt: c.trialEndsAt, checkInPointLimit: c.pointLimit, houseLimit: c.houseLimit, contractEndsAt: c.contractEndsAt },
      });
      await tx.billingProfile.create({ data: { organizationId: org.id, ...c.billing } });
      await tx.retentionSetting.create({ data: { organizationId: org.id } });
      await tx.staffUser.create({
        data: {
          organizationId: org.id,
          username: c.adminUsername,
          fullName: c.adminFullName,
          email: c.contactEmail,
          role: "ADMIN",
          passwordHash: c.adminPasswordHash,
          mustChangePassword: true,
        },
      });
      return org.id;
    });
  },
  async updateContract(id, c) {
    return prisma.$transaction(async (tx) => {
      const n = await tx.organization.updateMany({ where: { id }, data: { contactEmail: c.contactEmail, checkInPointLimit: c.pointLimit, houseLimit: c.houseLimit, contractEndsAt: c.contractEndsAt } });
      if (!n.count) return false;
      await tx.billingProfile.upsert({ where: { organizationId: id }, create: { organizationId: id, ...c.billing }, update: c.billing });
      return true;
    });
  },
  async renewalsDue(before, platformSlug) {
    return prisma.organization.count({ where: { status: { not: "SUSPENDED" }, slug: { not: platformSlug }, contractEndsAt: { lte: before } } });
  },
  async modeOf(id) {
    const o = await prisma.organization.findUnique({ where: { id }, select: { siteMode: true } });
    return o ? { mode: o.siteMode } : null;
  },
  async suspend(id) {
    return (await prisma.organization.updateMany({ where: { id }, data: { status: "SUSPENDED" } })).count > 0;
  },
  async resume(id) {
    const o = await prisma.organization.findUnique({ where: { id }, select: { status: true, paidUntil: true, trialEndsAt: true } });
    if (!o || o.status !== "SUSPENDED") return false;
    const status = !o.paidUntil && o.trialEndsAt ? "TRIAL" : "ACTIVE";
    return (await prisma.organization.updateMany({ where: { id, status: "SUSPENDED" }, data: { status } })).count > 0;
  },
  async resetAdminPassword(orgId, username, passwordHash) {
    return prisma.$transaction(async (tx) => {
      const u = await tx.staffUser.findFirst({ where: { organizationId: orgId, username, role: "ADMIN" } });
      if (!u) return false;
      await tx.staffUser.update({
        where: { id: u.id },
        data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null, isActive: true },
      });
      await tx.staffSession.deleteMany({ where: { userId: u.id } });
      return true;
    });
  },
};
