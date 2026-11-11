import "server-only";
import type { DirectoryAdminRepository } from "@/application/directory/directory-admin.types";
import { db } from "../db/tenant";
import { readHouseQuota } from "./house-quota";
import { organizationMode } from "./org-mode";

/** จัดการรายชื่อหลัก — ทุก query จำกัดในองค์กร orgId */
export const prismaDirectoryAdminRepository = (orgId: string): DirectoryAdminRepository => {
  const t = db(orgId);

  const siteSelect = {
    id: true,
    code: true,
    name: true,
    mode: true,
    defaultMaxStayMinutes: true,
    inductionVersion: true,
    _count: { select: { tenants: { where: { isActive: true } }, hosts: { where: { isActive: true } } } },
  } as const;
  type SiteSel = { id: string; code: string; name: string; mode: "OFFICE" | "FACTORY" | "VILLAGE"; defaultMaxStayMinutes: number | null; inductionVersion: string | null; _count: { tenants: number; hosts: number } };
  const toSite = ({ _count, ...s }: SiteSel) => ({ ...s, units: _count.tenants, people: _count.hosts });

  return {
    orgMode: () => organizationMode(orgId),
    async sites() {
      // เฉพาะสถานที่ตามโหมดขององค์กร
      const mode = await organizationMode(orgId);
      return (await t.site.findMany({ where: mode ? { mode } : {}, orderBy: { createdAt: "asc" }, select: siteSelect })).map(toSite);
    },
    async site(id) {
      const s = await t.site.findUnique({ where: { id }, select: siteSelect });
      return s && toSite(s);
    },
    async createSite(s) {
      // รหัสสถานที่ SITE-n ไม่ซ้ำในองค์กร
      const codes = new Set((await t.site.findMany({ select: { code: true } })).map((x) => x.code));
      let n = codes.size + 1;
      while (codes.has(`SITE-${n}`)) n++;
      return (await t.site.create({ data: { ...s, code: `SITE-${n}`, organizationId: orgId } })).id;
    },
    async updateSite(id, s) {
      return (await t.site.updateMany({ where: { id }, data: s })).count > 0;
    },

    async units(siteId) {
      const rows = await t.tenant.findMany({
        where: { siteId },
        orderBy: [{ isActive: "desc" }, { floor: "asc" }, { name: "asc" }],
        select: { id: true, name: true, floor: true, unit: true, phone: true, isActive: true, _count: { select: { hosts: { where: { isActive: true } } } } },
      });
      return rows.map(({ _count, ...r }) => ({ ...r, people: _count.hosts }));
    },
    houseQuota: () => readHouseQuota(orgId),
    async unitState(id) {
      const u = await t.tenant.findUnique({ where: { id }, select: { isActive: true, site: { select: { mode: true } } } });
      return u ? { isActive: u.isActive, siteMode: u.site.mode } : null;
    },
    async unitInSite(id, siteId) {
      return (await t.tenant.count({ where: { id, siteId } })) > 0;
    },
    async createUnit(siteId, u) {
      return (await t.tenant.create({ data: { ...u, siteId, organizationId: orgId } })).id;
    },
    async updateUnit(id, u) {
      return (await t.tenant.updateMany({ where: { id }, data: u })).count > 0;
    },

    async people(siteId) {
      const rows = await t.host.findMany({
        where: { siteId },
        orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
        select: { id: true, fullName: true, department: true, tenantId: true, phone: true, email: true, isActive: true, lineUserId: true },
      });
      return rows.map(({ lineUserId, ...r }) => ({ ...r, lineLinked: !!lineUserId }));
    },
    async personSite(id) {
      return (await t.host.findUnique({ where: { id }, select: { siteId: true } }))?.siteId ?? null;
    },
    async createPerson(siteId, p) {
      return (await t.host.create({ data: { ...p, siteId, organizationId: orgId } })).id;
    },
    async updatePerson(id, p) {
      return (await t.host.updateMany({ where: { id }, data: p })).count > 0;
    },

    bays: (siteId) =>
      t.loadingBay.findMany({ where: { siteId }, orderBy: [{ isActive: "desc" }, { code: "asc" }], select: { id: true, code: true, name: true, zone: true, isActive: true } }),
    async createBay(siteId, b) {
      return (await t.loadingBay.create({ data: { ...b, siteId, organizationId: orgId } })).id;
    },
    async updateBay(id, b) {
      return (await t.loadingBay.updateMany({ where: { id }, data: b })).count > 0;
    },

    async importDirectory(siteId, d) {
      return t.$transaction(async (tx) => {
        let skipped = 0;
        const units = new Map<string, string>();
        for (const u of await tx.tenant.findMany({ where: { siteId }, select: { id: true, name: true } })) units.set(u.name.toLowerCase(), u.id);
        let addedUnits = 0;
        for (const x of d.tenants) {
          const key = x.name.toLowerCase();
          if (units.has(key)) {
            skipped++;
            continue;
          }
          const u = await tx.tenant.create({ data: { organizationId: orgId, siteId, name: x.name, floor: x.floor } });
          units.set(key, u.id);
          addedUnits++;
        }

        const people = new Set(
          (await tx.host.findMany({ where: { siteId }, select: { fullName: true, tenantId: true } })).map((h) => `${h.fullName.toLowerCase()}|${h.tenantId ?? ""}`),
        );
        const newPeople = [];
        for (const h of d.hosts) {
          const tenantId = h.tenantName ? (units.get(h.tenantName.toLowerCase()) ?? null) : null;
          const key = `${h.fullName.toLowerCase()}|${tenantId ?? ""}`;
          if (people.has(key)) {
            skipped++;
            continue;
          }
          people.add(key);
          newPeople.push({ organizationId: orgId, siteId, fullName: h.fullName, department: h.department, tenantId });
        }
        if (newPeople.length) await tx.host.createMany({ data: newPeople });

        const codes = new Set((await tx.loadingBay.findMany({ where: { siteId }, select: { code: true } })).map((b) => b.code));
        const newBays = d.bays.filter((b) => !codes.has(b.code));
        skipped += d.bays.length - newBays.length;
        if (newBays.length) {
          await tx.loadingBay.createMany({ data: newBays.map((b) => ({ organizationId: orgId, siteId, code: b.code, name: b.name })), skipDuplicates: true });
        }
        return { units: addedUnits, people: newPeople.length, bays: newBays.length, skipped };
      });
    },
  };
};
