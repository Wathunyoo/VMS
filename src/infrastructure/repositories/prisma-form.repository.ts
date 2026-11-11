import "server-only";
import type { FormSettingsRepository } from "@/application/settings/form-settings.types";
import { resolveFieldConfig, type CustomFieldDef } from "@/domain/form/form-config";
import { db } from "../db/tenant";
import { organizationMode } from "./org-mode";

export const prismaFormRepository = (orgId: string): FormSettingsRepository => {
  const t = db(orgId);
  return {
    async config() {
      const [s, mode] = await Promise.all([t.formSetting.findUnique({ where: { organizationId: orgId } }), organizationMode(orgId)]);
      return { fields: resolveFieldConfig(s?.fields, mode), disabledPurposes: s?.disabledPurposes ?? [] };
    },
    async saveConfig(fields, disabledPurposes, by) {
      await t.formSetting.upsert({
        where: { organizationId: orgId },
        create: { organizationId: orgId, fields, disabledPurposes, updatedBy: by },
        update: { fields, disabledPurposes, updatedBy: by },
      });
    },
    async customFields(includeInactive) {
      const rows = await t.customField.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      return rows.map(
        (r): CustomFieldDef => ({
          id: r.id,
          label: r.label,
          type: r.type,
          options: r.options,
          required: r.required,
          modes: r.modes,
          showOnPass: r.showOnPass,
          isActive: r.isActive,
          sortOrder: r.sortOrder,
        }),
      );
    },
    async createCustomField(f) {
      const last = await t.customField.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
      const r = await t.customField.create({ data: { ...f, organizationId: orgId, sortOrder: (last?.sortOrder ?? -1) + 1 } });
      return r.id;
    },
    async updateCustomField(id, f) {
      return (await t.customField.updateMany({ where: { id }, data: f })).count > 0;
    },
  };
};
