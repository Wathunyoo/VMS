import "server-only";
import type { HistoryQuery, HistoryRow, ReportFilter, ReportRepository } from "@/application/reports/report.types";
import type { CustomValue } from "@/domain/form/form-config";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db/prisma";
import { db } from "../db/tenant";

/**
 * รายงานขององค์กร orgId
 * query แบบ raw SQL (จัดกลุ่มตามวัน/ชั่วโมงเวลาไทย) ไม่ผ่าน tenant extension — ต้องมี organizationId ทุกครั้ง
 */
/** คอลัมน์เป็น timestamp (UTC ไม่มีโซน) — ส่งเป็นข้อความ UTC กันการแปลงตาม TimeZone ของ session */
const utc = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");

export const prismaReportRepository = (orgId: string): ReportRepository => {
  const t = db(orgId);

  const where = (f: ReportFilter): Prisma.VisitWhereInput => ({
    checkInAt: { gte: f.from, lt: f.to },
    status: { not: "CANCELLED" },
    ...(f.siteId ? { siteId: f.siteId } : {}),
    ...(f.purpose ? { purpose: f.purpose } : {}),
  });

  const sqlWhere = (f: ReportFilter) =>
    Prisma.sql`v."organizationId" = ${orgId}
      AND v."checkInAt" >= ${utc(f.from)}::timestamp AND v."checkInAt" < ${utc(f.to)}::timestamp
      AND v."status" <> 'CANCELLED'
      ${f.siteId ? Prisma.sql`AND v."siteId" = ${f.siteId}` : Prisma.empty}
      ${f.purpose ? Prisma.sql`AND v."purpose" = ${f.purpose}::"VisitPurpose"` : Prisma.empty}`;

  // timestamp ในฐานข้อมูลเป็น UTC (ไม่มีโซน) → แปลงเป็นเวลาไทย
  const local = Prisma.sql`((v."checkInAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')`;

  const historyWhere = (q: HistoryQuery): Prisma.VisitWhereInput => {
    const w: Prisma.VisitWhereInput = where(q);
    if (q.status === "INSIDE") w.status = "CHECKED_IN";
    if (q.status === "OUT") w.status = "CHECKED_OUT";
    if (q.q) {
      const s = q.q;
      const c = { contains: s, mode: "insensitive" as const };
      w.OR = [
        { passCode: c },
        { badgeNumber: c },
        { visitor: { fullName: c } },
        { visitor: { company: c } },
        { vehicle: { plateNumber: { contains: s.replace(/\s+/g, " ").toUpperCase() } } },
        { tenant: { name: c } },
        { host: { fullName: c } },
      ];
      // ค้นเบอร์โทรเฉพาะเมื่อพิมพ์ตัวเลขอย่างน้อย 4 หลัก (กัน "1กข" ไปตรงกับเบอร์ที่มีเลข 1)
      const digits = s.replace(/[\s-]/g, "");
      if (/^\+?\d{4,}$/.test(digits)) w.OR.push({ visitor: { phone: { contains: digits.replace(/^\+66/, "0") } } });
    }
    return w;
  };

  return {
    sites: () => t.site.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, mode: true } }),

    async summary(f) {
      const [r] = await prisma.$queryRaw<
        { total: bigint; unique_visitors: bigint; with_vehicle: bigint; avg_minutes: number | null; overstay: bigint }[]
      >`
        SELECT count(*) AS total,
               count(DISTINCT v."visitorId") AS unique_visitors,
               count(vi."id") AS with_vehicle,
               avg(v."timeSpentMinutes")::float AS avg_minutes,
               count(*) FILTER (WHERE v."overstayMinutes" > 0) AS overstay
        FROM "Visit" v
        LEFT JOIN "VehicleInfo" vi ON vi."visitId" = v."id"
        WHERE ${sqlWhere(f)}`;
      return {
        total: Number(r.total),
        uniqueVisitors: Number(r.unique_visitors),
        withVehicle: Number(r.with_vehicle),
        avgMinutes: r.avg_minutes === null ? null : Math.round(r.avg_minutes),
        overstay: Number(r.overstay),
      };
    },

    insideNow: (siteId) => t.visit.count({ where: { status: "CHECKED_IN", ...(siteId ? { siteId } : {}) } }),

    async daily(f) {
      const rows = await prisma.$queryRaw<{ day: string; count: bigint }[]>`
        SELECT to_char(${local}, 'YYYY-MM-DD') AS day, count(*) AS count
        FROM "Visit" v WHERE ${sqlWhere(f)} GROUP BY 1 ORDER BY 1`;
      return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
    },

    async hourly(f) {
      const rows = await prisma.$queryRaw<{ hour: number; count: bigint }[]>`
        SELECT extract(hour FROM ${local})::int AS hour, count(*) AS count
        FROM "Visit" v WHERE ${sqlWhere(f)} GROUP BY 1 ORDER BY 1`;
      return rows.map((r) => ({ hour: r.hour, count: Number(r.count) }));
    },

    async byPurpose(f) {
      const rows = await t.visit.groupBy({ by: ["purpose"], where: where(f), _count: { _all: true } });
      return rows.map((r) => ({ purpose: r.purpose, count: r._count._all }));
    },

    async topUnits(f, limit) {
      const rows = await prisma.$queryRaw<{ name: string; floor: string; mode: "OFFICE" | "FACTORY" | "VILLAGE"; count: bigint }[]>`
        SELECT tn."name", tn."floor", v."mode"::text AS mode, count(*) AS count
        FROM "Visit" v JOIN "Tenant" tn ON tn."id" = v."tenantId" AND tn."organizationId" = ${orgId}
        WHERE ${sqlWhere(f)}
        GROUP BY tn."id", tn."name", tn."floor", v."mode"
        ORDER BY count DESC, tn."name" LIMIT ${limit}`;
      return rows.map((r) => ({ ...r, count: Number(r.count) }));
    },

    async history(q, skip, take) {
      const w = historyWhere(q);
      const [rows, total] = await Promise.all([
        t.visit.findMany({
          where: w,
          orderBy: { checkInAt: "desc" },
          skip,
          take,
          include: {
            site: { select: { name: true } },
            visitor: { select: { fullName: true, company: true, phone: true, idType: true, idNumberMasked: true, purgedAt: true } },
            tenant: { select: { name: true, floor: true, unit: true } },
            host: { select: { fullName: true, department: true } },
            vehicle: { select: { plateNumber: true, plateProvince: true, vehicleType: true, platePhotoUrl: true } },
          },
        }),
        t.visit.count({ where: w }),
      ]);
      return {
        total,
        rows: rows.map(
          (v): HistoryRow => ({
            id: v.id,
            passCode: v.passCode,
            siteName: v.site.name,
            mode: v.mode,
            checkInAt: v.checkInAt,
            checkOutAt: v.checkOutAt,
            expectedCheckOutAt: v.expectedCheckOutAt,
            timeSpentMinutes: v.timeSpentMinutes,
            overstayMinutes: v.overstayMinutes,
            status: v.status,
            visitorName: v.visitor.fullName,
            purged: !!v.visitor.purgedAt,
            company: v.visitor.company,
            phone: v.visitor.phone,
            idType: v.visitor.idType,
            idNumberMasked: v.visitor.idNumberMasked,
            purpose: v.purpose,
            purposeNote: v.purposeNote,
            unit: v.tenant,
            hostName: v.host?.fullName ?? null,
            hostDepartment: v.host?.department ?? null,
            stampStatus: v.stampStatus,
            plate: v.vehicle ? [v.vehicle.plateNumber, v.vehicle.plateProvince].filter(Boolean).join(" ") : null,
            platePhotoUrl: v.vehicle?.platePhotoUrl ?? null,
            vehicleType: v.vehicle?.vehicleType ?? null,
            badgeNumber: v.badgeNumber,
            customValues: Array.isArray(v.customValues) ? (v.customValues as unknown as CustomValue[]) : [],
            checkedInBy: v.checkedInBy,
            checkedOutBy: v.checkedOutBy,
          }),
        ),
      };
    },
  };
};
