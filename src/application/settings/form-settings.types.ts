import type { CustomFieldDef, CustomFieldType, FieldConfig, FormConfig } from "@/domain/form/form-config";
import type { SiteMode, VisitPurpose } from "@/domain/visit/types";

export interface CustomFieldInput {
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  modes: SiteMode[];
  showOnPass: boolean;
}

/** repository ของแบบฟอร์ม (ผูกองค์กรแล้ว) */
export interface FormSettingsRepository {
  config(): Promise<FormConfig>;
  saveConfig(fields: FieldConfig, disabledPurposes: VisitPurpose[], by: string): Promise<void>;
  /** includeInactive = รวมช่องที่ปิดไว้ (หน้าตั้งค่า) */
  customFields(includeInactive: boolean): Promise<CustomFieldDef[]>;
  createCustomField(f: CustomFieldInput): Promise<string>;
  updateCustomField(id: string, f: Partial<CustomFieldInput> & { isActive?: boolean; sortOrder?: number }): Promise<boolean>;
}
