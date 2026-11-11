"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { Building2, ClipboardList, Factory, Home, Loader2, LogIn, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { maskIdNumber } from "@/domain/visit/id-masking";
import { STAY_OPTIONS_MINUTES, stayLimitText } from "@/domain/visit/stay";
import { appliesToMode, customFieldName, type CustomFieldDef, type FieldConfig } from "@/domain/form/form-config";
import { ID_TYPE_LABEL, PURPOSE_LABEL, PURPOSES_BY_MODE, SITE_MODE_LABEL } from "@/domain/visit/labels";
import { ID_DOCUMENT_TYPES, SITE_MODES, type IdDocumentType, type SiteMode, type VisitPurpose } from "@/domain/visit/types";
import type { CheckInDirectory } from "@/infrastructure/repositories/prisma-directory.repository";
import { cn } from "@/lib/utils";
import { IdCardScanner } from "@/features/id-scan/components/id-card-scanner";
import type { ParsedIdCard } from "@/domain/visit/id-card-parser";
import { isCardExpired, type CardAgentCard } from "@/domain/idcard/thai-smartcard";
import { CardReaderStatus } from "@/features/id-scan/components/card-reader-status";
import type { InviteView } from "@/application/guest-invite/guest-invite.types";
import { InviteCheckIn } from "@/features/guest-invite/components/invite-check-in";
import { checkInAction, type CheckInState } from "../actions";
import { CameraCapture } from "./camera-capture";
import { FactorySection } from "./factory-section";
import { Field } from "./field";
import { OfficeSection } from "./office-section";
import { VehicleSection } from "./vehicle-section";

interface Props {
  sites: CheckInDirectory;
  defaultMode?: SiteMode;
  form: { fields: FieldConfig; disabledPurposes: VisitPurpose[]; customFields: CustomFieldDef[] };
  /** แขกที่ลูกบ้านแจ้งล่วงหน้าวันนี้ */
  invites?: InviteView[];
  /** เปิดกล้องสแกน QR แขกทันที (มาจากปุ่ม "สแกน QR แขก" ในเมนูหลัก) */
  autoScan?: boolean;
}

const MODE_ICON = { OFFICE: Building2, FACTORY: Factory, VILLAGE: Home } as const;
const MODE_ACTIVE: Record<SiteMode, string> = {
  OFFICE: "bg-office text-white",
  FACTORY: "bg-factory text-white",
  VILLAGE: "bg-village text-white",
};
const MODE_PANEL: Record<SiteMode, string> = {
  OFFICE: "border-office/40 bg-office/5",
  FACTORY: "border-factory/50 bg-factory/10",
  VILLAGE: "border-village/50 bg-village/10",
};

export function CheckInForm({ sites, defaultMode = "OFFICE", form, invites = [], autoScan = false }: Props) {
  const f = form.fields;
  // แสดงเฉพาะโหมดที่องค์กรมีสถานที่
  const modes = useMemo(() => {
    const m = SITE_MODES.filter((x) => sites.some((s) => s.mode === x));
    return m.length ? m : [defaultMode];
  }, [sites, defaultMode]);
  const [state, formAction, pending] = useActionState<CheckInState, FormData>(checkInAction, {});
  const [mode, setMode] = useState<SiteMode>(defaultMode);
  const sitesForMode = useMemo(() => sites.filter((s) => s.mode === mode), [sites, mode]);
  const [siteId, setSiteId] = useState(sitesForMode[0]?.id ?? "");
  const site = sitesForMode.find((s) => s.id === siteId) ?? sitesForMode[0];

  const [idType, setIdType] = useState<IdDocumentType>("NATIONAL_ID");
  const [idNumber, setIdNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [cardImage, setCardImage] = useState<string | null>(null);

  /** ข้อมูลจากเครื่องอ่านบัตร (ชิป) — เชื่อถือได้กว่า OCR จึงแทนที่ข้อมูลเดิมทั้งหมด */
  const [chipNotice, setChipNotice] = useState<{ name: string; expired: boolean } | null>(null);
  const applyCard = (c: CardAgentCard) => {
    setFullName(c.fullName);
    setIdType("NATIONAL_ID");
    setIdNumber(c.cid);
    setCardImage(f.idCardPhoto !== "HIDDEN" ? c.photo : null);
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    setChipNotice({ name: c.fullName, expired: isCardExpired(c.expireDate, today) });
  };

  const applyScan = (r: ParsedIdCard, img: string | null) => {
    setChipNotice(null);
    if (img) setCardImage(img);
    if (r.fullName) setFullName(r.fullName);
    if (r.idNumber) {
      setIdType(r.idType);
      setIdNumber(r.idNumber);
    }
  };

  /** แขกที่แจ้งล่วงหน้า (สแกน QR แล้ว) — บ้าน/ลูกบ้าน/ทะเบียนรถ กรอกให้อัตโนมัติ */
  const [invite, setInvite] = useState<InviteView | null>(null);
  const applyInvite = (v: InviteView) => {
    setMode(v.mode);
    setSiteId(v.siteId);
    if (v.guestName && !fullName) setFullName(v.guestName);
    setInvite(v);
  };

  const errors = Object.fromEntries(
    Object.entries(state.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]]),
  ) as Record<string, string | undefined>;

  const switchMode = (next: SiteMode) => {
    setInvite(null);
    setMode(next);
    setSiteId(sites.find((s) => s.mode === next)?.id ?? "");
  };

  // submit เองเพื่อไม่ให้ React reset ฟอร์มเมื่อ validation ไม่ผ่าน
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };

  const purposes = PURPOSES_BY_MODE[mode].filter((p) => !form.disabledPurposes.includes(p));
  const customFields = form.customFields.filter((c) => appliesToMode(c, mode));
  const req = (k: keyof FieldConfig) => f[k] === "REQUIRED";
  const show = (k: keyof FieldConfig) => f[k] !== "HIDDEN";

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="siteId" value={site?.id ?? ""} />
      {invite && <input type="hidden" name="inviteId" value={invite.id} />}

      {/* ---------- แขกที่แจ้งล่วงหน้า ---------- */}
      {modes.some((m) => m !== "FACTORY") &&
        (invite ? (
          <div role="status" className="flex flex-wrap items-start justify-between gap-3 rounded-xl border-2 border-village bg-village/10 p-4">
            <div className="space-y-0.5 text-sm">
              <p className="font-semibold text-village">✓ แขกที่ลูกบ้านแจ้งล่วงหน้า — QR ถูกต้อง</p>
              <p>
                <span className="font-medium">{invite.placeText}</span> · แจ้งโดย คุณ{invite.hostName}
              </p>
              <p className="text-muted-foreground">
                {invite.windowText}
                {invite.plateNumber && ` · ทะเบียน ${invite.plateNumber}`}
                {invite.guestName && ` · ${invite.guestName}`}
              </p>
              {invite.note && <p className="text-muted-foreground">หมายเหตุ: {invite.note}</p>}
              <p className="text-xs text-muted-foreground">ตรวจบัตร/ถ่ายรูปตามปกติ แล้วกด Check-in — ระบบจะแจ้ง LINE สมาชิกในบ้านให้</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setInvite(null)}>
              ไม่ใช้ QR นี้
            </Button>
          </div>
        ) : (
          <InviteCheckIn initial={invites} onApply={applyInvite} autoScan={autoScan} />
        ))}

      {/* ---------- Mode toggle ---------- */}
      <div className={cn("flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 p-4 transition-colors", MODE_PANEL[mode])}>
        {modes.length > 1 ? (
          <div role="radiogroup" aria-label="โหมด" className="flex flex-wrap gap-1 rounded-lg bg-background p-1">
            {modes.map((m) => {
              const Icon = MODE_ICON[m];
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => switchMode(m)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    mode === m ? MODE_ACTIVE[m] : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="size-4" /> {SITE_MODE_LABEL[m]}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="flex items-center gap-2 font-medium">
            {(() => {
              const Icon = MODE_ICON[mode];
              return <Icon className="size-5" />;
            })()}
            {SITE_MODE_LABEL[mode]}
          </span>
        )}
        <NativeSelect className="w-auto min-w-56 bg-background" value={site?.id ?? ""} onChange={(e) => setSiteId(e.target.value)} aria-label="สถานที่">
          {sitesForMode.length === 0 && <option value="">ไม่มีสถานที่สำหรับโหมดนี้</option>}
          {sitesForMode.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {/* ---------- Visitor ---------- */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>
            <UserRound className="size-5" /> ข้อมูลผู้ติดต่อ
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <CardReaderStatus onCard={applyCard} />
            <IdCardScanner onApply={applyScan} keepImage={f.idCardPhoto !== "HIDDEN"} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-[1fr_220px]">
          <div className="grid content-start gap-3 sm:grid-cols-2">
            {chipNotice && (
              <p
                role="status"
                className={cn(
                  "rounded-md px-3 py-2 text-sm sm:col-span-2",
                  chipNotice.expired ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-900",
                )}
              >
                อ่านจากเครื่องอ่านบัตรแล้ว: {chipNotice.name}
                {chipNotice.expired && " — ⚠ บัตรหมดอายุแล้ว ตรวจสอบเอกสารอื่นประกอบ"}
              </p>
            )}
            {cardImage && <input type="hidden" name="idCardPhoto" value={cardImage} />}
            {(cardImage || errors.idCardPhoto) && (
              <div className="flex items-center gap-3 rounded-md border p-2 sm:col-span-2">
                {cardImage ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cardImage} alt="ภาพบัตรที่สแกน" className="h-16 rounded border object-contain" />
                    <span className="flex-1 text-xs text-muted-foreground">ภาพบัตรจะถูกบันทึกกับรายการนี้</span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setCardImage(null)}>
                      ลบภาพบัตร
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-destructive">{errors.idCardPhoto} — กดปุ่ม “สแกนบัตร” ด้านบน</p>
                )}
              </div>
            )}
            <Field id="fullName" label="ชื่อ-นามสกุล" required={req("fullName")} error={errors.fullName} className="sm:col-span-2">
              <Input
                id="fullName"
                name="fullName"
                autoComplete="off"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                aria-invalid={!!errors.fullName}
              />
            </Field>
            <Field id="idType" label="ประเภทเอกสาร" required={req("idNumber")}>
              <NativeSelect id="idType" name="idType" value={idType} onChange={(e) => setIdType(e.target.value as IdDocumentType)}>
                {ID_DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ID_TYPE_LABEL[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              id="idNumber"
              label="เลขที่เอกสาร"
              required={req("idNumber")}
              error={errors.idNumber}
              hint={idNumber && <>บันทึกเป็น: <span className="font-mono">{maskIdNumber(idNumber, idType)}</span></>}
            >
              <Input
                id="idNumber"
                name="idNumber"
                autoComplete="off"
                inputMode={idType === "NATIONAL_ID" ? "numeric" : "text"}
                maxLength={20}
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                aria-invalid={!!errors.idNumber}
              />
            </Field>
            {show("company") && (
              <Field id="company" label="บริษัท / หน่วยงาน" required={req("company")} error={errors.company}>
                <Input id="company" name="company" aria-invalid={!!errors.company} />
              </Field>
            )}
            {show("phone") && (
              <Field id="phone" label="เบอร์โทรศัพท์" required={req("phone")} error={errors.phone}>
                <Input id="phone" name="phone" type="tel" inputMode="tel" aria-invalid={!!errors.phone} />
              </Field>
            )}
            <Field id="purpose" label="วัตถุประสงค์" required error={errors.purpose}>
              <NativeSelect key={mode} id="purpose" name="purpose" defaultValue={purposes[0]}>
                {purposes.map((p) => (
                  <option key={p} value={p}>
                    {PURPOSE_LABEL[p]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {show("badgeNumber") && (
              <Field id="badgeNumber" label={req("badgeNumber") ? "เลขบัตรแลก" : "เลขบัตรแลก (ถ้ามี)"} required={req("badgeNumber")} error={errors.badgeNumber}>
                <Input id="badgeNumber" name="badgeNumber" placeholder="เช่น V-015" aria-invalid={!!errors.badgeNumber} />
              </Field>
            )}
            <Field id="maxStayMinutes" label="เวลาอยู่ได้" hint="เลือก “ไม่จำกัดเวลา” สำหรับผู้ที่พักค้างคืน/อยู่ทั้งวัน">
              <NativeSelect key={site?.id} id="maxStayMinutes" name="maxStayMinutes" defaultValue="">
                <option value="">ตามค่าตั้งของสถานที่ ({stayLimitText(site?.defaultMaxStayMinutes ?? null)})</option>
                {STAY_OPTIONS_MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {m >= 1440 ? `${m / 1440} วัน` : stayLimitText(m)}
                  </option>
                ))}
                <option value="0">ไม่จำกัดเวลา</option>
              </NativeSelect>
            </Field>
            {show("purposeNote") && (
              <Field id="purposeNote" label="รายละเอียดเพิ่มเติม" required={req("purposeNote")} error={errors.purposeNote} className="sm:col-span-2">
                <Textarea id="purposeNote" name="purposeNote" rows={2} aria-invalid={!!errors.purposeNote} />
              </Field>
            )}
          </div>

          {show("facePhoto") && (
            <CameraCapture name="facePhoto" label={`ภาพถ่ายผู้ติดต่อ${req("facePhoto") ? " *" : ""}`} facingMode="user" error={errors.facePhoto} />
          )}
        </CardContent>
      </Card>

      {/* ---------- Mode-specific ---------- */}
      {site && (mode === "OFFICE" || mode === "VILLAGE") && (
        <OfficeSection
          key={`${site.id}-${invite?.id ?? ""}`}
          site={site}
          mode={mode}
          errors={errors}
          hostRequired={req("host")}
          initial={invite && invite.siteId === site.id ? { tenantId: invite.tenantId, hostId: invite.hostId } : undefined}
        />
      )}
      {site && mode === "FACTORY" && <FactorySection key={site.id} errors={errors} inductionVersion={site.inductionVersion} fields={f} />}

      {(show("vehicle") || (mode === "FACTORY" && f.vehicle === "HIDDEN")) && (
        <VehicleSection
          key={`${mode}-${site?.id}-${invite?.id ?? ""}`}
          initialPlate={invite?.plateNumber}
          mode={mode}
          loadingBays={site?.loadingBays ?? []}
          errors={errors}
          vehicleState={f.vehicle === "HIDDEN" ? "OPTIONAL" : f.vehicle}
          platePhotoState={f.platePhoto}
        />
      )}

      {/* ---------- ช่องที่องค์กรเพิ่มเอง ---------- */}
      {customFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <ClipboardList className="size-5" /> ข้อมูลเพิ่มเติม
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {customFields.map((c) => {
              const name = customFieldName(c.id);
              const err = errors[name];
              if (c.type === "CHECKBOX") {
                return (
                  <div key={`${mode}-${c.id}`} className="space-y-1 sm:col-span-2">
                    <div className="flex items-start gap-2">
                      <Checkbox id={name} name={name} className="mt-0.5" aria-invalid={!!err} />
                      <Label htmlFor={name} className="leading-snug">
                        {c.label}
                        {c.required && <span className="text-destructive"> *</span>}
                      </Label>
                    </div>
                    {err && <p className="pl-6 text-xs text-destructive">{err}</p>}
                  </div>
                );
              }
              return (
                <Field key={`${mode}-${c.id}`} id={name} label={c.label} required={c.required} error={err}>
                  {c.type === "SELECT" ? (
                    <NativeSelect id={name} name={name} defaultValue="" aria-invalid={!!err}>
                      <option value="">— เลือก —</option>
                      {c.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      id={name}
                      name={name}
                      type={c.type === "NUMBER" ? "number" : "text"}
                      inputMode={c.type === "NUMBER" ? "decimal" : undefined}
                      maxLength={300}
                      aria-invalid={!!err}
                    />
                  )}
                </Field>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ---------- PDPA + submit ---------- */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-start gap-2">
              <Checkbox id="pdpaConsent" name="pdpaConsent" className="mt-0.5" aria-invalid={!!errors.pdpaConsent} />
              <Label htmlFor="pdpaConsent" className="leading-snug">
                <ShieldCheck className="mr-1 inline size-4" />
                ผู้ติดต่อยินยอมให้เก็บข้อมูลส่วนบุคคล ภาพถ่าย และภาพบัตร เพื่อความปลอดภัยของสถานที่ ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)
              </Label>
            </div>
            {errors.pdpaConsent && <p className="pl-6 text-xs text-destructive">{errors.pdpaConsent}</p>}
          </div>
          <Button type="submit" size="lg" disabled={pending || !site} className="shrink-0">
            {pending ? <Loader2 className="animate-spin" /> : <LogIn />} Check-in &amp; ออกบัตร
          </Button>
        </CardContent>
      </Card>

      {state.error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
