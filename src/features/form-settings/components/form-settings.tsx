"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CheckCircle2, HardHat, Loader2, Pencil, Plus, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  BUILTIN_FIELD_KEYS,
  BUILTIN_FIELDS,
  fieldGroup,
  type BuiltinFieldKey,
  CUSTOM_FIELD_TYPE_LABEL,
  CUSTOM_FIELD_TYPES,
  FIELD_STATE_LABEL,
  type CustomFieldDef,
  type CustomFieldType,
  type FieldConfig,
  type FieldState,
  type FormConfig,
} from "@/domain/form/form-config";
import { PURPOSE_LABEL, PURPOSES_BY_MODE, SITE_TYPE_LABEL } from "@/domain/visit/labels";
import type { SiteMode, VisitPurpose } from "@/domain/visit/types";
import { cn } from "@/lib/utils";
import { moveCustomFieldAction, saveCustomFieldAction, saveFieldConfigAction, setCustomFieldActiveAction } from "../actions";

interface Props {
  config: FormConfig;
  customFields: CustomFieldDef[];
  /** โหมดที่องค์กรมีสถานที่ */
  modes: SiteMode[];
}

type Draft = { label: string; type: CustomFieldType; options: string; required: boolean; modes: SiteMode[]; showOnPass: boolean };
const EMPTY: Draft = { label: "", type: "TEXT", options: "", required: false, modes: [], showOnPass: false };

export function FormSettings({ config, customFields, modes }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldConfig>(config.fields);
  const [disabled, setDisabled] = useState<VisitPurpose[]>(config.disabledPurposes);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string, after?: () => void) => {
    setError(null);
    setSaved(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "เกิดข้อผิดพลาด");
      if (okText) setSaved(okText);
      after?.();
      router.refresh();
    });
  };

  const openEditor = (f?: CustomFieldDef) => {
    setEditing(f?.id ?? "new");
    setDraft(f ? { label: f.label, type: f.type, options: f.options.join("\n"), required: f.required, modes: f.modes, showOnPass: f.showOnPass } : EMPTY);
  };

  const factory = modes.includes("FACTORY");
  // ผู้ที่ต้องการพบ ไม่มีในหน้า Check-in ของโรงงาน
  const generalKeys = BUILTIN_FIELD_KEYS.filter((k) => fieldGroup(k) === "general" && !(k === "host" && modes.every((m) => m === "FACTORY")));
  const factoryKeys = BUILTIN_FIELD_KEYS.filter((k) => fieldGroup(k) === "factory");
  const labelFor = (k: BuiltinFieldKey) =>
    k === "host" && modes.length === 1 ? (modes[0] === "VILLAGE" ? "ลูกบ้านที่มาหา" : "ผู้ที่ต้องการพบ (Host)") : BUILTIN_FIELDS[k].label;

  const togglePurpose = (p: VisitPurpose, on: boolean) => setDisabled((d) => (on ? d.filter((x) => x !== p) : [...d, p]));
  const shownPurposes = [...new Set(modes.flatMap((m) => PURPOSES_BY_MODE[m]))];

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="flex items-center gap-2 rounded-md border border-green-600/40 bg-green-50 px-4 py-2 text-sm text-green-900">
          <CheckCircle2 className="size-4" /> {saved}
        </p>
      )}

      {/* ---------- ช่องมาตรฐาน ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>ช่องมาตรฐาน</CardTitle>
          <CardDescription>ชื่อ-นามสกุล และวัตถุประสงค์ ต้องกรอกเสมอ</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {generalKeys.map((k) => (
            <FieldRow key={k} k={k} value={fields[k]} label={labelFor(k)} onChange={(st) => setFields({ ...fields, [k]: st })} />
          ))}
        </CardContent>
      </Card>

      {/* ---------- Safety & Work Permit (โรงงาน) ---------- */}
      {factory && (
        <Card className="border-l-4 border-l-factory">
          <CardHeader>
            <CardTitle>
              <HardHat className="size-5 text-factory" /> Safety &amp; Work Permit
            </CardTitle>
            <CardDescription>บังคับ = ต้องติ๊ก/กรอกก่อนอนุญาตเข้าพื้นที่ · ไม่บังคับ = แสดงให้ติ๊กได้ · ซ่อน = ไม่แสดงในหน้า Check-in</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {factoryKeys.map((k) => (
              <FieldRow key={k} k={k} value={fields[k]} label={labelFor(k)} onChange={(st) => setFields({ ...fields, [k]: st })} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ---------- วัตถุประสงค์ ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>วัตถุประสงค์การมา</CardTitle>
          <CardDescription>ติ๊กออกเพื่อซ่อนจากรายการในหน้า Check-in</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shownPurposes.map((p) => (
              <label key={p} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox checked={!disabled.includes(p)} onCheckedChange={(v) => togglePurpose(p, v === true)} />
                {PURPOSE_LABEL[p]}
                <span className="ml-auto text-xs text-muted-foreground">
                  {modes.filter((m) => PURPOSES_BY_MODE[m].includes(p)).map((m) => SITE_TYPE_LABEL[m]).join(" / ")}
                </span>
              </label>
            ))}
          </div>
          <Button disabled={pending} onClick={() => act(() => saveFieldConfigAction({ fields, disabledPurposes: disabled }), "บันทึกการตั้งค่าแบบฟอร์มแล้ว")}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} บันทึกการตั้งค่าแบบฟอร์ม
          </Button>
        </CardContent>
      </Card>

      {/* ---------- ช่องที่เพิ่มเอง ---------- */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle>ช่องที่เพิ่มเอง</CardTitle>
            <CardDescription>เช่น จำนวนผู้ติดตาม สีรถ เลขที่ใบสั่งงาน — แสดงในหน้า Check-in และรายงาน/Excel</CardDescription>
          </div>
          {editing === null && (
            <Button variant="outline" onClick={() => openEditor()}>
              <Plus /> เพิ่มช่อง
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {customFields.length === 0 && editing === null && <p className="py-4 text-center text-sm text-muted-foreground">ยังไม่มีช่องที่เพิ่มเอง</p>}
          {customFields.map((f, i) =>
            editing === f.id ? (
              <Editor key={f.id} draft={draft} setDraft={setDraft} modes={modes} pending={pending} onCancel={() => setEditing(null)} onSave={() => act(() => saveCustomFieldAction(f.id, toInput(draft)), "บันทึกช่องแล้ว", () => setEditing(null))} />
            ) : (
              <div key={f.id} className={cn("flex flex-wrap items-center gap-3 rounded-lg border p-3", !f.isActive && "bg-muted/50 text-muted-foreground")}>
                <div className="flex flex-col">
                  <button type="button" aria-label="เลื่อนขึ้น" disabled={pending || i === 0} onClick={() => act(() => moveCustomFieldAction(f.id, -1))} className="rounded p-0.5 hover:bg-accent disabled:opacity-30">
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button type="button" aria-label="เลื่อนลง" disabled={pending || i === customFields.length - 1} onClick={() => act(() => moveCustomFieldAction(f.id, 1))} className="rounded p-0.5 hover:bg-accent disabled:opacity-30">
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {f.label} {f.required && <span className="text-destructive">*</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs">
                    <Badge variant="secondary">{CUSTOM_FIELD_TYPE_LABEL[f.type]}</Badge>
                    {f.type === "SELECT" && <span className="text-muted-foreground">{f.options.join(" · ")}</span>}
                    <Badge variant="outline">{f.modes.length ? f.modes.map((m) => SITE_TYPE_LABEL[m]).join(", ") : "ทุกสถานที่"}</Badge>
                    {f.showOnPass && <Badge variant="outline">แสดงบนบัตร</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={f.isActive} aria-label={`เปิดใช้ ${f.label}`} disabled={pending} onCheckedChange={(v) => act(() => setCustomFieldActiveAction(f.id, v))} />
                  <Button size="sm" variant="ghost" disabled={pending || editing !== null} onClick={() => openEditor(f)}>
                    <Pencil /> แก้ไข
                  </Button>
                </div>
              </div>
            ),
          )}
          {editing === "new" && (
            <Editor draft={draft} setDraft={setDraft} modes={modes} pending={pending} onCancel={() => setEditing(null)} onSave={() => act(() => saveCustomFieldAction(null, toInput(draft)), "เพิ่มช่องแล้ว", () => setEditing(null))} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FieldRow({ k, value, label, onChange }: { k: BuiltinFieldKey; value: FieldState; label: string; onChange: (st: FieldState) => void }) {
  const def = BUILTIN_FIELDS[k];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        {"hint" in def && <p className="text-xs text-muted-foreground">{def.hint}</p>}
      </div>
      <div role="radiogroup" aria-label={label} className="flex rounded-lg border p-0.5">
        {(def.allowed as readonly FieldState[]).map((st) => (
          <button
            key={st}
            type="button"
            role="radio"
            aria-checked={value === st}
            onClick={() => onChange(st)}
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              value === st
                ? st === "HIDDEN"
                  ? "bg-muted-foreground text-white"
                  : st === "REQUIRED"
                    ? "bg-primary text-primary-foreground"
                    : "bg-accent font-medium"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {FIELD_STATE_LABEL[st]}
          </button>
        ))}
      </div>
    </div>
  );
}

const toInput = (d: Draft) => ({
  label: d.label,
  type: d.type,
  options: d.options.split(/\r?\n/).map((o) => o.trim()).filter(Boolean),
  required: d.required,
  modes: d.modes,
  showOnPass: d.showOnPass,
});

function Editor({
  draft,
  setDraft,
  modes,
  pending,
  onSave,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  modes: SiteMode[];
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border-2 border-primary p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="space-y-1.5">
          <Label htmlFor="cf-label">ชื่อช่อง</Label>
          <Input id="cf-label" value={draft.label} maxLength={60} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="เช่น จำนวนผู้ติดตาม" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-type">ประเภท</Label>
          <NativeSelect id="cf-type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as CustomFieldType })}>
            {CUSTOM_FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {CUSTOM_FIELD_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {draft.type === "SELECT" && (
        <div className="space-y-1.5">
          <Label htmlFor="cf-options">ตัวเลือก (บรรทัดละ 1 ตัวเลือก)</Label>
          <Textarea id="cf-options" rows={4} value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} placeholder={"ขาว\nดำ\nเทา"} />
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox checked={draft.required} onCheckedChange={(v) => setDraft({ ...draft, required: v === true })} /> บังคับกรอก
        </label>
        <label className="flex items-center gap-2">
          <Checkbox checked={draft.showOnPass} onCheckedChange={(v) => setDraft({ ...draft, showOnPass: v === true })} /> แสดงบนบัตรผ่าน
        </label>
      </div>
      {modes.length > 1 && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">ใช้กับ (ไม่เลือก = ทุกสถานที่)</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {modes.map((m) => (
              <label key={m} className="flex items-center gap-2">
                <Checkbox
                  checked={draft.modes.includes(m)}
                  onCheckedChange={(v) => setDraft({ ...draft, modes: v === true ? [...draft.modes, m] : draft.modes.filter((x) => x !== m) })}
                />
                {SITE_TYPE_LABEL[m]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex gap-2">
        <Button disabled={pending || !draft.label.trim()} onClick={onSave}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} บันทึกช่อง
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}
