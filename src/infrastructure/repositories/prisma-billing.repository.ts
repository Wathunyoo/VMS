import "server-only";
import type {
  BillingProfileData,
  BillingRepository,
  DeviceRepository,
  InvoiceRecord,
  PlatformBillingRepository,
  SlipCheck,
  SlipReuse,
} from "@/application/billing/billing.types";
import { extendCoverage } from "@/domain/billing/access";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db/prisma";
import { db } from "../db/tenant";

type InvoiceRow = Prisma.InvoiceGetPayload<object>;
type Tx = Prisma.TransactionClient;

const toRecord = (r: InvoiceRow): InvoiceRecord => ({
  id: r.id,
  organizationId: r.organizationId,
  number: r.number,
  status: r.status,
  period: r.period,
  points: r.points,
  months: r.months,
  unitPrice: Number(r.unitPrice),
  subtotal: Number(r.subtotal),
  vat: Number(r.vat),
  total: Number(r.total),
  withholding: Number(r.withholding),
  netPayable: Number(r.netPayable),
  buyer: r.buyer as unknown as BillingProfileData,
  slipPath: r.slipPath,
  slipUploadedAt: r.slipUploadedAt,
  transferredAt: r.transferredAt,
  reviewNote: r.reviewNote,
  receiptNumber: r.receiptNumber,
  slipCheck: (r.slipCheck as unknown as SlipCheck | null) ?? null,
  paidAt: r.paidAt,
  coverFrom: r.coverFrom,
  coverUntil: r.coverUntil,
  createdAt: r.createdAt,
});

/** เลขที่เอกสารต่อเนื่องรายเดือน (เวลาไทย) เช่น INV-202610-0001 */
async function nextNumber(tx: Tx, prefix: "INV" | "RC", at: Date): Promise<string> {
  const ym = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Bangkok" }).format(at).replace("-", "");
  const key = `${prefix}-${ym}`;
  const c = await tx.documentCounter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return `${key}-${String(c.value).padStart(4, "0")}`;
}

/** สลิปที่ใช้กับใบแจ้งหนี้อื่นแล้ว (ชำระแล้ว/รอตรวจ) — ค้นทั้งแพลตฟอร์ม */
async function findSlipReuse(
  q: { hash: string; transRef: string | null; exceptInvoiceId: string },
  orgId: string | null,
): Promise<SlipReuse | null> {
  const or: Prisma.InvoiceWhereInput[] = [{ slipHash: q.hash }];
  if (q.transRef) or.push({ slipTransRef: q.transRef });
  const r = await prisma.invoice.findFirst({
    where: { id: { not: q.exceptInvoiceId }, status: { in: ["PAID", "PENDING_REVIEW"] }, OR: or },
    select: { number: true, organizationId: true },
    orderBy: { createdAt: "asc" },
  });
  return r && { number: r.number, sameOrg: orgId === null || r.organizationId === orgId };
}

const OPEN: InvoiceRow["status"][] = ["PENDING_PAYMENT", "PENDING_REVIEW", "REJECTED"];

export const prismaBillingRepository = (orgId: string): BillingRepository => {
  const t = db(orgId);
  return {
    org: () =>
      prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { id: true, slug: true, name: true, status: true, trialEndsAt: true, paidUntil: true, checkInPointLimit: true },
      }),
    async profile() {
      const p = await t.billingProfile.findUnique({ where: { organizationId: orgId } });
      return p && { legalName: p.legalName, taxId: p.taxId, branch: p.branch, address: p.address, billingEmail: p.billingEmail };
    },
    async saveProfile(p) {
      await t.billingProfile.upsert({ where: { organizationId: orgId }, create: { ...p, organizationId: orgId }, update: p });
    },
    async invoices(limit) {
      return (await t.invoice.findMany({ orderBy: { createdAt: "desc" }, take: limit })).map(toRecord);
    },
    async invoice(id) {
      const r = await t.invoice.findUnique({ where: { id } });
      return r && toRecord(r);
    },
    async openInvoice() {
      const r = await t.invoice.findFirst({ where: { status: { in: OPEN } }, orderBy: { createdAt: "desc" } });
      return r && toRecord(r);
    },
    async createInvoice(inv, now) {
      const r = await prisma.$transaction(async (tx) =>
        tx.invoice.create({
          data: {
            organizationId: orgId,
            number: await nextNumber(tx, "INV", now),
            period: inv.period,
            points: inv.points,
            months: inv.months,
            unitPrice: inv.unitPrice,
            subtotal: inv.subtotal,
            vat: inv.vat,
            total: inv.total,
            withholding: inv.withholding,
            netPayable: inv.netPayable,
            buyer: inv.buyer as unknown as Prisma.InputJsonValue,
            createdBy: inv.createdBy,
          },
        }),
      );
      return toRecord(r);
    },
    async attachSlip(id, slip, at) {
      const { count } = await t.invoice.updateMany({
        where: { id, status: { in: ["PENDING_PAYMENT", "REJECTED"] } },
        data: {
          slipPath: slip.path,
          slipHash: slip.hash,
          slipTransRef: slip.transRef,
          slipCheck: slip.check as unknown as Prisma.InputJsonValue,
          transferredAt: slip.transferredAt,
          slipUploadedAt: at,
          status: "PENDING_REVIEW",
          reviewNote: null,
        },
      });
      return count > 0;
    },
    findSlipReuse: (q) => findSlipReuse(q, orgId),
    async cancel(id) {
      const { count } = await t.invoice.updateMany({
        where: { id, status: { in: ["PENDING_PAYMENT", "REJECTED"] } },
        data: { status: "CANCELLED" },
      });
      return count > 0;
    },
  };
};

const withOrg = { organization: { select: { slug: true, name: true } } } as const;
const toPlatform = (r: InvoiceRow & { organization: { slug: string; name: string } }) => ({
  ...toRecord(r),
  orgSlug: r.organization.slug,
  orgName: r.organization.name,
});

/** ผู้ให้บริการตรวจสลิป — ข้ามองค์กร (ใช้หลัง requirePlatformAdmin เท่านั้น) */
export const prismaPlatformBillingRepository: PlatformBillingRepository = {
  async pendingReview() {
    return (await prisma.invoice.findMany({ where: { status: "PENDING_REVIEW" }, include: withOrg, orderBy: { slipUploadedAt: "asc" } })).map(toPlatform);
  },
  async recent(limit) {
    return (
      await prisma.invoice.findMany({ where: { status: { not: "PENDING_REVIEW" } }, include: withOrg, orderBy: { updatedAt: "desc" }, take: limit })
    ).map(toPlatform);
  },
  async invoice(id) {
    const r = await prisma.invoice.findUnique({ where: { id }, include: withOrg });
    return r && toPlatform(r);
  },
  async approve(id, by, at) {
    return prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({ where: { id }, include: { organization: true } });
      if (!inv || inv.status !== "PENDING_REVIEW") return null;
      const cover = extendCoverage(inv.organization.paidUntil, at, inv.months);
      const receiptNumber = await nextNumber(tx, "RC", at);
      const { count } = await tx.invoice.updateMany({
        where: { id, status: "PENDING_REVIEW" },
        data: { status: "PAID", paidAt: at, reviewedBy: by, receiptNumber, coverFrom: cover.from, coverUntil: cover.until },
      });
      if (count === 0) return null;
      await tx.organization.update({
        where: { id: inv.organizationId },
        data: { paidUntil: cover.until, checkInPointLimit: inv.points, status: inv.organization.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE" },
      });
      return { receiptNumber, coverUntil: cover.until };
    });
  },
  async reject(id, by, note) {
    const { count } = await prisma.invoice.updateMany({
      where: { id, status: "PENDING_REVIEW" },
      data: { status: "REJECTED", reviewedBy: by, reviewNote: note },
    });
    return count > 0;
  },
  async saveSlipCheck(id, check, transRef) {
    await prisma.invoice.update({
      where: { id },
      data: { slipCheck: check as unknown as Prisma.InputJsonValue, ...(transRef ? { slipTransRef: transRef } : {}) },
    });
  },
  findSlipReuse: (q) => findSlipReuse(q, null),
  async billingEmail(organizationId) {
    const p = await prisma.billingProfile.findUnique({ where: { organizationId }, select: { billingEmail: true } });
    if (p) return p.billingEmail;
    const o = await prisma.organization.findUnique({ where: { id: organizationId }, select: { contactEmail: true } });
    return o?.contactEmail ?? null;
  },
};

export const prismaDeviceRepository = (orgId: string): DeviceRepository => {
  const t = db(orgId);
  return {
    async list() {
      const rows = await t.checkInPoint.findMany({
        where: { revokedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          createdAt: true,
          lastSeenAt: true,
          createdBy: true,
          tokenHash: true,
          staff: { select: { id: true, username: true, fullName: true, isActive: true }, orderBy: { username: "asc" } },
        },
      });
      return rows.map(({ tokenHash, ...r }) => ({ ...r, hasDevice: !!tokenHash }));
    },
    activeCount: () => t.checkInPoint.count({ where: { revokedAt: null } }),
    async register(name, tokenHash, by) {
      return (await t.checkInPoint.create({ data: { organizationId: orgId, name, tokenHash, createdBy: by } })).id;
    },
    async claim(id, tokenHash) {
      return (await t.checkInPoint.updateMany({ where: { id, revokedAt: null }, data: { tokenHash } })).count > 0;
    },
    async revoke(id, at) {
      const ok = (await t.checkInPoint.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at, tokenHash: null } })).count > 0;
      if (ok) await t.staffUser.updateMany({ where: { checkInPointId: id }, data: { checkInPointId: null } });
      return ok;
    },
    async findActive(tokenHash) {
      const d = await t.checkInPoint.findFirst({ where: { tokenHash, revokedAt: null } });
      if (!d) return null;
      const rank = await t.checkInPoint.count({ where: { revokedAt: null, createdAt: { lt: d.createdAt } } });
      return { id: d.id, name: d.name, rank };
    },
    async touch(id, at) {
      await t.checkInPoint.updateMany({ where: { id }, data: { lastSeenAt: at } });
    },
  };
};
