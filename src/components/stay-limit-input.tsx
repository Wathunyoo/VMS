"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * เวลาอยู่ได้สูงสุด (ชม.) + ตัวเลือก “ไม่จำกัดเวลา”
 * value = "" หมายถึงไม่จำกัดเวลา
 */
export function StayLimitInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const unlimited = value === "";
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>อยู่ได้สูงสุด (ชม.)</Label>
      <Input id={id} type="number" min={0.5} max={168} step={0.5} value={unlimited ? "" : value} placeholder={unlimited ? "ไม่จำกัด" : ""} disabled={unlimited} onChange={(e) => onChange(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={unlimited} onCheckedChange={(v) => onChange(v === true ? "" : "8")} /> ไม่จำกัดเวลา
      </label>
    </div>
  );
}

/** "" → null (ไม่จำกัด) */
export const stayHoursValue = (v: string): number | null => (v === "" ? null : Number(v));
