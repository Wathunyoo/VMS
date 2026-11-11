"use client";

import { useState } from "react";
import { HardHat, ShieldAlert, ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_FIELD_CONFIG, type FieldConfig } from "@/domain/form/form-config";
import { HIGH_RISK_LABEL, PPE_LABEL } from "@/domain/visit/labels";
import { HIGH_RISK_WORKS, PPE_ITEMS, type HighRiskWork } from "@/domain/visit/types";
import { cn } from "@/lib/utils";
import { Field } from "./field";

const SAFETY_RULES = [
  "สวมใส่ PPE ตลอดเวลาในพื้นที่ผลิต",
  "เดินในทางเดินที่กำหนด (เส้นสีเขียว) เท่านั้น",
  "ห้ามสูบบุหรี่ / ถ่ายภาพ โดยไม่ได้รับอนุญาต",
  "เมื่อได้ยินสัญญาณเตือนภัย ให้ไปยังจุดรวมพล (Assembly Point)",
  "ติดบัตรผู้ติดต่อให้มองเห็นชัดเจน และอยู่กับผู้ดูแลตลอดเวลา",
];

/** Safety & Work Permit — แต่ละช่อง บังคับ / ไม่บังคับ / ซ่อน ตามการตั้งค่าแบบฟอร์มขององค์กร */
export function FactorySection({
  errors,
  inductionVersion,
  fields = DEFAULT_FIELD_CONFIG,
}: {
  errors: Record<string, string | undefined>;
  inductionVersion?: string | null;
  fields?: FieldConfig;
}) {
  const [risks, setRisks] = useState<HighRiskWork[]>([]);
  const ppe = PPE_ITEMS.filter((k) => fields[k] !== "HIDDEN");
  const showRisk = fields.highRiskWorks !== "HIDDEN";
  const showPermit = fields.workPermit !== "HIDDEN";
  const showInduction = fields.induction !== "HIDDEN";
  const permitRequired = fields.workPermit === "REQUIRED" && showRisk;
  if (!ppe.length && !showRisk && !showPermit && !showInduction) return null;

  const toggleRisk = (r: HighRiskWork, on: boolean) => setRisks((prev) => (on ? [...prev, r] : prev.filter((x) => x !== r)));

  return (
    <Card className="border-l-4 border-l-factory">
      <CardHeader>
        <CardTitle>
          <HardHat className="size-5 text-factory" /> Safety &amp; Work Permit
        </CardTitle>
        <CardDescription>ตรวจ PPE และงานเสี่ยงก่อนอนุญาตเข้าพื้นที่ผลิต</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {ppe.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">อุปกรณ์คุ้มครองความปลอดภัย (PPE)</legend>
            <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3", errors.ppe && "rounded-md p-2 ring-1 ring-destructive")}>
              {ppe.map((item) => (
                <label key={item} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm has-[[data-state=checked]]:bg-factory/10">
                  <Checkbox name={item} />
                  {PPE_LABEL[item]}
                  {fields[item] === "REQUIRED" && <span className="text-destructive">*</span>}
                </label>
              ))}
            </div>
            {errors.ppe && <p className="text-xs text-destructive">{errors.ppe}</p>}
          </fieldset>
        )}

        {(showRisk || showPermit) && (
          <fieldset className="space-y-2">
            <legend className="flex items-center gap-1.5 text-sm font-medium">
              <ShieldAlert className="size-4 text-destructive" /> {showRisk ? "ประเภทงานเสี่ยง (ถ้ามี)" : "ใบอนุญาตทำงาน"}
            </legend>
            {showRisk && (
              <div className="grid gap-2 sm:grid-cols-2">
                {HIGH_RISK_WORKS.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm">
                    <Checkbox name="highRiskWorks" value={r} onCheckedChange={(v) => toggleRisk(r, v === true)} />
                    {HIGH_RISK_LABEL[r]}
                  </label>
                ))}
              </div>
            )}
            {showPermit && (
              <Field
                id="workPermitId"
                label="เลขที่ใบอนุญาตทำงาน (Work Permit ID)"
                required={permitRequired && risks.length > 0}
                hint={permitRequired ? "ต้องกรอกเมื่อเลือกงานเสี่ยง" : undefined}
                error={errors.workPermitId}
                className="pt-1"
              >
                <Input id="workPermitId" name="workPermitId" placeholder="เช่น WP-2026-00123" aria-invalid={!!errors.workPermitId} />
              </Field>
            )}
          </fieldset>
        )}

        {showInduction && (
          <div className={cn("space-y-3 rounded-md border bg-muted/50 p-4", errors.inductionCompleted && "border-destructive")}>
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <ClipboardCheck className="size-4" /> Safety Induction
              {inductionVersion && <span className="text-xs font-normal text-muted-foreground">(ฉบับ {inductionVersion})</span>}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {SAFETY_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="flex items-start gap-2">
              <Checkbox id="inductionCompleted" name="inductionCompleted" className="mt-0.5" />
              <Label htmlFor="inductionCompleted" className="leading-snug">
                ผู้ติดต่อได้รับการอบรมและรับทราบกฎความปลอดภัยของโรงงานแล้ว
                {fields.induction === "REQUIRED" && <span className="text-destructive"> *</span>}
              </Label>
            </div>
            {errors.inductionCompleted && <p className="text-xs text-destructive">{errors.inductionCompleted}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
