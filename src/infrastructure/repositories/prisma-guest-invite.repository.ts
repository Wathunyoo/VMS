import "server-only";
import type { InviteRecord, PublicInviteRepository, StaffInviteRepository } from "@/application/guest-invite/guest-invite.types";
import type { Prisma } from "@/generated/prisma/client";
import { prisma as rootPrisma } from "../db/prisma";
import { db } from "../db/tenant";

const select = {
  id: true,
  token: true,
  siteId: true,
  site: { select: { name: true, mode: true } },
  tenantId: true,
  tenant: { select: { name: true, floor: true, unit: true } },
  hostId: true,
  host: { select: { fullName: true } },
  guestName: true,
  plateNumber: true,
  note: true,
  validFrom: true,
  validUntil: true,
  status: true,
  usedAt: true,
} satisfies Prisma.GuestInviteSelect;

type Row = Prisma.GuestInviteGetPayload<{ select: typeof select }>;

const toRecord = (r: Row): InviteRecord => ({
  id: r.id,
  token: r.token,
  siteId: r.siteId,
  siteName: r.site.name,
  mode: r.site.mode,
  tenantId: r.tenantId,
  tenant: r.tenant,
  hostId: r.hostId,
  hostName: r.host.fullName,
  guestName: r.guestName,
  plateNumber: r.plateNumber,
  note: r.note,
  validFrom: r.validFrom,
  validUntil: r.validUntil,
  status: r.status,
  usedAt: r.usedAt,
});

/**
 * หน้าสาธารณะ (ลูกบ้าน/แขก) — ไม่ผูกองค์กรล่วงหน้า
 * ทุก query ระบุ hostId ที่ได้จากลิงก์ที่เซ็นแล้ว หรือ token สุ่มของแขก
 */
export const publicInviteRepository: PublicInviteRepository = {
  async findResident(hostId) {
    const h = await rootPrisma.host.findUnique({
      where: { id: hostId },
      select: {
        id: true,
        organizationId: true,
        fullName: true,
        lineUserId: true,
        isActive: true,
        organization: { select: { status: true } },
        site: { select: { id: true, name: true, mode: true } },
        tenant: { select: { id: true, name: true, floor: true, unit: true, isActive: true } },
      },
    });
    if (!h) return null;
    return {
      id: h.id,
      organizationId: h.organizationId,
      fullName: h.fullName,
      lineUserId: h.lineUserId,
      // บ้านที่ปิดใช้งานแล้ว = ลูกบ้านแจ้งแขกไม่ได้
      isActive: h.isActive && (h.tenant?.isActive ?? true),
      orgSuspended: h.organization.status === "SUSPENDED",
      siteId: h.site.id,
      siteName: h.site.name,
      mode: h.site.mode,
      tenant: h.tenant && { id: h.tenant.id, name: h.tenant.name, floor: h.tenant.floor, unit: h.tenant.unit },
    };
  },

  countOpen: (hostId, now) => rootPrisma.guestInvite.count({ where: { hostId, status: "ACTIVE", validUntil: { gt: now } } }),

  async create(r, input, token) {
    const row = await rootPrisma.guestInvite.create({
      data: {
        organizationId: r.organizationId,
        siteId: r.siteId,
        tenantId: r.tenant?.id ?? null,
        hostId: r.id,
        token,
        guestName: input.guestName,
        plateNumber: input.plateNumber,
        note: input.note,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
      },
      select,
    });
    return toRecord(row);
  },

  async listForHost(hostId, since) {
    const rows = await rootPrisma.guestInvite.findMany({
      where: { hostId, validUntil: { gt: since } },
      select,
      orderBy: { validFrom: "asc" },
      take: 100,
    });
    return rows.map(toRecord);
  },

  async cancel(hostId, inviteId, at) {
    const { count } = await rootPrisma.guestInvite.updateMany({
      where: { id: inviteId, hostId, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: at },
    });
    return count > 0;
  },

  async findByToken(token) {
    const row = await rootPrisma.guestInvite.findUnique({ where: { token }, select });
    return row && toRecord(row);
  },
};

/** จุด รปภ. — จำกัดอยู่ในองค์กรของเจ้าหน้าที่ */
export const prismaStaffInviteRepository = (orgId: string): StaffInviteRepository => {
  const prisma = db(orgId);
  return {
    async findByToken(token) {
      const row = await prisma.guestInvite.findFirst({ where: { token }, select });
      return row && toRecord(row);
    },
    async findById(id) {
      const row = await prisma.guestInvite.findFirst({ where: { id }, select });
      return row && toRecord(row);
    },
    async listActiveBetween(from, to) {
      const rows = await prisma.guestInvite.findMany({
        where: { status: "ACTIVE", validUntil: { gte: from }, validFrom: { lte: to } },
        select,
        orderBy: { validFrom: "asc" },
        take: 200,
      });
      return rows.map(toRecord);
    },
  };
};
