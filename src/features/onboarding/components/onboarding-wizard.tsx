"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, Factory, Home, Loader2, MessageCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StayLimitInput, stayHoursValue } from "@/components/stay-limit-input";
import { cn } from "@/lib/utils";
import { addDirectoryAction, createSiteAction, finishAction } from "../actions";

type Mode = "OFFICE" | "FACTORY" | "VILLAGE";

interface Props {
  orgName: string;
  initialStep: 1 | 2 | 3;
  site: { mode: Mode; name: string } | null;
  /** ผู้ให้บริการกำหนดประเภทธุรกิจไว้แล้ว */
  orgMode: Mode | null;
  counts: { hosts: number; tenants: number };
}

const MODE_STYLE: Record<Mode, string> = {
  OFFICE: "border-office bg-office/5",
  FACTORY: "border-factory bg-factory/10",
  VILLAGE: "border-village bg-village/10",
};

const MODE_TITLE: Record<Mode, string> = { OFFICE: "อาคารสำนักงาน", FACTORY: "โรงงาน", VILLAGE: "หมู่บ้าน / คอนโด" };

const PLACEHOLDER: Record<Mode, string> = {
  OFFICE: "เช่น อาคาร ABC Tower",
  FACTORY: "เช่น โรงงานระยอง",
  VILLAGE: "เช่น หมู่บ้านสวนสวย",
};

const STEPS = ["สถานที่", "รายชื่อ", "เริ่มใช้งาน"];

export function OnboardingWizard({ orgName, initialStep, site: initialSite, orgMode, counts }: Props) {
  const [step, setStep] = useState(initialStep);
  const [site, setSite] = useState(initialSite);
  const [mode, setMode] = useState<Mode>(initialSite?.mode ?? orgMode ?? "OFFICE");
  const [name, setName] = useState(initialSite?.name ?? "");
  const [hours, setHours] = useState("8");
  const [tenants, setTenants] = useState("");
  const [hosts, setHosts] = useState("");
  const [bays, setBays] = useState("");
  const [added, setAdded] = useState<{ tenants: number; hosts: number; bays: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, onOk: (d: T) => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.ok) onOk(r.data);
      else setError(r.error);
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">ยินดีต้อนรับ {orgName}</h1>
        <p className="text-sm text-muted-foreground">ตั้งค่าเริ่มต้น 3 ขั้นตอน ใช้เวลาไม่ถึง 5 นาที</p>
      </div>

      <ol className="flex gap-2" aria-label="ขั้นตอน">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={step === i + 1 ? "step" : undefined}
            className={cn(
              "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              step === i + 1 && "border-primary bg-primary text-primary-foreground",
              step > i + 1 && "border-green-600 text-green-700",
            )}
          >
            <span className="font-bold">{i + 1}</span> {label}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>สถานที่แรกของคุณ</CardTitle>
            <CardDescription>เพิ่มสถานที่อื่นภายหลังได้</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {orgMode ? (
              <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                ประเภทธุรกิจ: <span className="font-semibold">{MODE_TITLE[orgMode]}</span> <span className="text-muted-foreground">(กำหนดโดยผู้ให้บริการ)</span>
              </p>
            ) : (
              <fieldset className="grid gap-3 sm:grid-cols-3">
                <legend className="mb-2 text-sm font-medium">
                  ประเภทธุรกิจ <span className="font-normal text-muted-foreground">— เลือกได้ 1 ประเภท และเปลี่ยนภายหลังไม่ได้</span>
                </legend>
                {(
                  [
                    ["OFFICE", Building2, "อาคารสำนักงาน", "ผู้เช่าหลายบริษัท · E-Stamp จาก Host"],
                    ["FACTORY", Factory, "โรงงาน", "PPE · Work Permit · Induction · รถขนส่ง"],
                    ["VILLAGE", Home, "หมู่บ้าน / คอนโด", "บ้านเลขที่ · ลูกบ้านยืนยันทาง LINE · ทะเบียนรถ"],
                  ] as const
                ).map(([value, Icon, title, desc]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-lg border-2 p-4",
                      mode === value ? MODE_STYLE[value] : "border-border",
                    )}
                  >
                    <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
                    <Icon className="size-6 shrink-0" />
                    <span>
                      <span className="block font-semibold">{title}</span>
                      <span className="text-xs text-muted-foreground">{desc}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <div className="space-y-1.5">
                <Label htmlFor="siteName">ชื่อสถานที่</Label>
                <Input id="siteName" value={name} onChange={(e) => setName(e.target.value)} placeholder={PLACEHOLDER[mode]} />
              </div>
              <StayLimitInput id="hours" value={hours} onChange={setHours} />
            </div>
            <Button
              disabled={pending || name.trim().length < 2}
              onClick={() =>
                run(
                  () =>
                    orgMode || confirm(`ยืนยันประเภท “${MODE_TITLE[mode]}”? เลือกแล้วเปลี่ยนภายหลังไม่ได้`)
                      ? createSiteAction({ name, mode, maxStayHours: stayHoursValue(hours) })
                      : Promise.resolve({ ok: false as const, error: "" }),
                  () => {
                    setSite({ mode, name });
                    setStep(2);
                  },
                )
              }
            >
              {pending && <Loader2 className="animate-spin" />} ถัดไป
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && site && (
        <Card>
          <CardHeader>
            <CardTitle>
              {site.mode === "OFFICE"
                ? "รายชื่อบริษัทผู้เช่าและผู้ที่ถูกเข้าพบ"
                : site.mode === "VILLAGE"
                  ? "รายชื่อบ้านและลูกบ้าน"
                  : "รายชื่อผู้ที่ถูกเข้าพบและจุดขนถ่ายสินค้า"}
            </CardTitle>
            <CardDescription>บรรทัดละรายการ คั่นช่องด้วยจุลภาค (,) — คัดลอกจาก Excel มาวางได้เลย · เพิ่ม/แก้ภายหลังได้ที่เมนู “ตั้งค่า → รายชื่อ”</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {site.mode === "OFFICE" && (
              <div className="space-y-1.5">
                <Label htmlFor="tenants">บริษัทผู้เช่า — ชั้น, ชื่อบริษัท</Label>
                <Textarea id="tenants" rows={4} value={tenants} onChange={(e) => setTenants(e.target.value)} placeholder={"12, บจก. อัลฟ่า เทคโนโลยี\n18, Beta Consulting"} />
              </div>
            )}
            {site.mode === "VILLAGE" && (
              <div className="space-y-1.5">
                <Label htmlFor="tenants">บ้าน — บ้านเลขที่, ซอย/โซน (ถ้ามี)</Label>
                <Textarea id="tenants" rows={5} value={tenants} onChange={(e) => setTenants(e.target.value)} placeholder={"99/1, 1\n99/2, 1\n99/15, 2"} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="hosts">
                {site.mode === "VILLAGE"
                  ? "ลูกบ้าน (ถ้ามี) — ชื่อ-นามสกุล, บ้านเลขที่"
                  : `Host (ผู้ที่ถูกเข้าพบ) — ชื่อ-นามสกุล, แผนก${site.mode === "OFFICE" ? ", ชื่อบริษัท" : ""}`}
              </Label>
              <Textarea
                id="hosts"
                rows={5}
                value={hosts}
                onChange={(e) => setHosts(e.target.value)}
                placeholder={
                  site.mode === "OFFICE"
                    ? "วิภา ใจดี, ฝ่ายขาย, บจก. อัลฟ่า เทคโนโลยี\nต้อนรับ, Reception, Beta Consulting"
                    : site.mode === "VILLAGE"
                      ? "สมชาย ใจดี, 99/1\nมาลี รักบ้าน, 99/15"
                      : "วิชัย ปลอดภัย, Safety\nสุนีย์ คลังสินค้า, Warehouse"
                }
              />
              <p className="text-xs text-muted-foreground">
                {site.mode === "VILLAGE"
                  ? "ลูกบ้านที่ใส่ไว้ เชื่อม LINE เพื่อรับแจ้งเตือนและยืนยันผู้มาหาได้"
                  : "ถ้ามีพนักงานต้อนรับของแต่ละบริษัท ใส่เป็น Host ได้"}
              </p>
            </div>
            {site.mode === "FACTORY" && (
              <div className="space-y-1.5">
                <Label htmlFor="bays">จุดขนถ่ายสินค้า — รหัส, ชื่อ (ถ้ามี)</Label>
                <Textarea id="bays" rows={3} value={bays} onChange={(e) => setBays(e.target.value)} placeholder={"LB-01, รับวัตถุดิบ\nLB-02, ส่งสินค้า"} />
              </div>
            )}
            <div className="flex gap-2">
              <Button
                disabled={pending || (site.mode === "VILLAGE" ? !tenants.trim() && counts.tenants === 0 : !hosts.trim() && counts.hosts === 0)}
                onClick={() =>
                  run(
                    () => addDirectoryAction({ tenants, hosts, bays }),
                    (d) => {
                      setAdded(d);
                      setStep(3);
                    },
                  )
                }
              >
                {pending && <Loader2 className="animate-spin" />} บันทึกและถัดไป
              </Button>
              {(site.mode === "VILLAGE" ? counts.tenants : counts.hosts) > 0 && (
                <Button variant="ghost" onClick={() => setStep(3)}>
                  ข้าม (มีรายชื่อแล้ว)
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-10 text-green-600" />
              <div>
                <p className="text-lg font-semibold">พร้อมใช้งานแล้ว</p>
                {added && (
                  <p className="text-sm text-muted-foreground">
                    เพิ่ม {added.tenants ? `${site?.mode === "VILLAGE" ? "บ้าน" : "ผู้เช่า"} ${added.tenants} · ` : ""}
                    {site?.mode === "VILLAGE" ? "ลูกบ้าน" : "Host"} {added.hosts}
                    {added.bays ? ` · จุดขนถ่าย ${added.bays}` : ""} รายการ
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/admin/users" className="flex gap-3 rounded-lg border p-4 hover:bg-accent">
                <Users className="size-5 shrink-0" />
                <span>
                  <span className="block font-medium">เพิ่มบัญชี รปภ. / ต้อนรับ</span>
                  <span className="text-xs text-muted-foreground">ทำหลังกดเริ่มใช้งานได้</span>
                </span>
              </Link>
              <Link href="/admin/host-line" className="flex gap-3 rounded-lg border p-4 hover:bg-accent">
                <MessageCircle className="size-5 shrink-0" />
                <span>
                  <span className="block font-medium">เชื่อม LINE ให้ Host</span>
                  <span className="text-xs text-muted-foreground">รับแจ้งเตือนและอนุมัติ E-Stamp</span>
                </span>
              </Link>
            </div>
            <Button size="lg" disabled={pending} onClick={() => run(() => finishAction(), () => {})}>
              {pending && <Loader2 className="animate-spin" />} เริ่มใช้งาน — ไปหน้า Check-in
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
