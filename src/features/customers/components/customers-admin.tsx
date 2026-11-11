"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, BellRing, Copy, Download, Factory, FileText, Home, KeyRound, Loader2, Plus, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SITE_TYPE_LABEL } from "@/domain/visit/labels";
import type { SiteMode } from "@/domain/visit/types";
import { cn } from "@/lib/utils";
import { createCustomerAction, resetCustomerAdminAction, resumeCustomerAction, suspendCustomerAction, updateCustomerContractAction } from "../actions";
import { EMPTY_FILTER, filterQuery, matchCustomer, type CustomerFilter, type CustomerView } from "../customer-view";
import { APP_NAME } from "@/lib/brand";

export type { CustomerView };

const MODE_ICON = {
  OFFICE: Building2,
  FACTORY: Factory,
  VILLAGE: Home,
} as const;

type Secret = {
  title: string;
  slug: string;
  username: string;
  password: string;
};

/** ข้อมูลตามสัญญา: จำนวนจุด + ใบกำกับภาษี */
type Contract = {
  contactEmail: string;
  pointLimit: string;
  houseLimit: string;
  /** YYYY-MM-DD หรือ "" */
  contractEndsAt: string;
  legalName: string;
  taxId: string;
  hq: boolean;
  branchNo: string;
  address: string;
};

const EMPTY_CONTRACT: Contract = {
  contactEmail: "",
  pointLimit: "1",
  houseLimit: "",
  contractEndsAt: "",
  legalName: "",
  taxId: "",
  hq: true,
  branchNo: "",
  address: "",
};

function contractOf(c: CustomerView): Contract {
  const b = c.billing;
  const branchNo = b && b.branch !== "สำนักงานใหญ่" ? b.branch.replace(/\D/g, "") : "";
  return {
    contactEmail: c.contactEmail ?? b?.billingEmail ?? "",
    pointLimit: String(c.pointLimit),
    houseLimit: c.houseLimit == null ? "" : String(c.houseLimit),
    contractEndsAt: c.contractEndYmd,
    legalName: b?.legalName ?? c.name,
    taxId: b?.taxId ?? "",
    hq: !branchNo,
    branchNo,
    address: b?.address ?? "",
  };
}

const contractPayload = (k: Contract) => ({
  contactEmail: k.contactEmail,
  pointLimit: Number(k.pointLimit),
  houseLimit: k.houseLimit.trim() === "" ? null : Number(k.houseLimit),
  contractEndsAt: k.contractEndsAt,
  legalName: k.legalName,
  taxId: k.taxId,
  branch: k.hq ? "สำนักงานใหญ่" : k.branchNo,
  address: k.address,
});

function ContractFields({ k, set, idp, village }: { k: Contract; set: (k: Contract) => void; idp: string; village: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idp}-points`}>จำนวนจุดลงทะเบียน (ตามสัญญา)</Label>
          <div className="flex items-center gap-2 text-sm">
            <Input
              id={`${idp}-points`}
              type="number"
              min={1}
              max={999}
              value={k.pointLimit}
              onChange={(e) => set({ ...k, pointLimit: e.target.value })}
              className="w-24"
            />{" "}
            จุด
          </div>
          <p className="text-xs text-muted-foreground">จำนวนเครื่องที่ลงทะเบียนเป็นจุด Check-in ได้ เช่น ป้อมประตูหน้า + ประตูหลัง = 2 จุด</p>
        </div>
        {village && (
          <div className="space-y-1">
            <Label htmlFor={`${idp}-houses`}>จำนวนบ้าน (ตามสัญญา)</Label>
            <div className="flex items-center gap-2 text-sm">
              <Input
                id={`${idp}-houses`}
                type="number"
                min={1}
                value={k.houseLimit}
                onChange={(e) => set({ ...k, houseLimit: e.target.value })}
                className="w-28"
              />{" "}
              หลัง
            </div>
            <p className="text-xs text-muted-foreground">ลูกค้าเพิ่มบ้านในระบบได้ไม่เกินจำนวนนี้ (บ้านที่ปิดใช้งานไม่นับ)</p>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor={`${idp}-end`}>วันสิ้นสุดสัญญา</Label>
          <Input id={`${idp}-end`} type="date" value={k.contractEndsAt} onChange={(e) => set({ ...k, contractEndsAt: e.target.value })} className="w-44" />
          <p className="text-xs text-muted-foreground">ใช้แจ้งเตือนให้ต่อสัญญาล่วงหน้า (ระบบไม่หยุดการใช้งานเอง) — เว้นว่างได้</p>
        </div>
      </div>
      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">ข้อมูลสำหรับออกใบกำกับภาษี</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${idp}-legal`}>ชื่อผู้ซื้อ / นิติบุคคล</Label>
            <Input
              id={`${idp}-legal`}
              value={k.legalName}
              onChange={(e) => set({ ...k, legalName: e.target.value })}
              placeholder="เช่น นิติบุคคลหมู่บ้านจัดสรรสวนสวย"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idp}-tax`}>เลขประจำตัวผู้เสียภาษี (13 หลัก)</Label>
            <Input
              id={`${idp}-tax`}
              inputMode="numeric"
              maxLength={17}
              value={k.taxId}
              onChange={(e) => set({ ...k, taxId: e.target.value })}
              className="font-mono"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name={`${idp}-branch`} checked={k.hq} onChange={() => set({ ...k, hq: true })} /> สำนักงานใหญ่
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={`${idp}-branch`} checked={!k.hq} onChange={() => set({ ...k, hq: false })} /> สาขาที่
          </label>
          {!k.hq && (
            <Input
              aria-label="เลขที่สาขา"
              inputMode="numeric"
              maxLength={5}
              value={k.branchNo}
              onChange={(e) => set({ ...k, branchNo: e.target.value })}
              placeholder="00001"
              className="w-28 font-mono"
            />
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idp}-addr`}>ที่อยู่ตามใบทะเบียน (ภ.พ.20 / หนังสือรับรอง)</Label>
          <Textarea id={`${idp}-addr`} rows={2} value={k.address} onChange={(e) => set({ ...k, address: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idp}-email`}>อีเมลติดต่อ / รับใบกำกับภาษี</Label>
          <Input id={`${idp}-email`} type="email" value={k.contactEmail} onChange={(e) => set({ ...k, contactEmail: e.target.value })} />
        </div>
      </fieldset>
    </div>
  );
}

const CONTRACT_TONE = {
  NONE: "text-muted-foreground",
  OK: "",
  SOON: "font-semibold text-amber-700",
  EXPIRED: "font-semibold text-destructive",
} as const;

export function CustomersAdmin({
  customers,
  loginUrl,
  initialFilter,
  noticeDays,
}: {
  customers: CustomerView[];
  loginUrl: string;
  initialFilter: CustomerFilter;
  noticeDays: number;
}) {
  const [f, setF] = useState<CustomerFilter>(initialFilter);
  const shown = useMemo(() => customers.filter((c) => matchCustomer(c, f)), [customers, f]);
  const others = customers.filter((c) => !c.isPlatform && c.status !== "SUSPENDED");
  const expired = others.filter((c) => c.contractState === "EXPIRED").length;
  const soon = others.filter((c) => c.contractState === "SOON").length;
  const noEnd = others.filter((c) => c.contractState === "NONE").length;
  const setFilter = (nf: CustomerFilter) => {
    setF(nf);
    // จำตัวกรองไว้ใน URL — รีเฟรช/แชร์ลิงก์ได้
    const q = filterQuery(nf);
    window.history.replaceState(null, "", q ? `?${q}` : window.location.pathname);
  };
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [adding, setAdding] = useState(customers.length <= 1);
  const [d, setD] = useState({
    name: "",
    slug: "",
    mode: "VILLAGE" as SiteMode,
    adminUsername: "admin",
    plan: "TRIAL",
    trialDays: "30",
  });
  const [k, setK] = useState<Contract>(EMPTY_CONTRACT);
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    village: boolean;
    k: Contract;
  } | null>(null);

  const act = <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, after?: (data: T) => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error);
      after?.(r.data);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {secret && (
        <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold">{secret.title} — แสดงครั้งเดียว ส่งให้ลูกค้าด้วยตนเอง</p>
          <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">
            <dt className="text-muted-foreground">ลิงก์ login</dt>
            <dd className="break-all font-mono">{`${loginUrl}?org=${secret.slug}`}</dd>
            <dt className="text-muted-foreground">รหัสองค์กร</dt>
            <dd className="font-mono">{secret.slug}</dd>
            <dt className="text-muted-foreground">ชื่อผู้ใช้</dt>
            <dd className="font-mono">{secret.username}</dd>
            <dt className="text-muted-foreground">รหัสชั่วคราว</dt>
            <dd className="font-mono text-lg tracking-wider">{secret.password}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigator.clipboard?.writeText(
                  `ระบบ${APP_NAME}\nลิงก์: ${loginUrl}?org=${secret.slug}\nรหัสองค์กร: ${secret.slug}\nชื่อผู้ใช้: ${secret.username}\nรหัสชั่วคราว: ${secret.password}\n(ระบบจะให้ตั้งรหัสใหม่เมื่อ login ครั้งแรก)`,
                )
              }
            >
              <Copy /> คัดลอกทั้งหมด
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSecret(null)}>
              ปิด
            </Button>
          </div>
          <p className="text-xs text-amber-900">ผู้ดูแลของลูกค้าจะถูกบังคับตั้งรหัสใหม่ แล้วเข้าสู่ขั้นตอนตั้งค่าเริ่มต้น (สถานที่ + รายชื่อ)</p>
        </section>
      )}

      {adding ? (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle>เพิ่มลูกค้า</CardTitle>
            <CardDescription>ประเภทธุรกิจเลือกได้ครั้งเดียว — เปลี่ยนภายหลังไม่ได้</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div role="radiogroup" aria-label="ประเภทธุรกิจ" className="grid gap-2 sm:grid-cols-3">
              {(["VILLAGE", "OFFICE", "FACTORY"] as const).map((m) => {
                const Icon = MODE_ICON[m];
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={d.mode === m}
                    onClick={() => setD({ ...d, mode: m })}
                    className={cn("flex items-center gap-2 rounded-lg border-2 p-3 text-left", d.mode === m ? "border-primary bg-primary/5" : "border-border")}
                  >
                    <Icon className="size-5" /> {SITE_TYPE_LABEL[m]}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="c-name">ชื่อลูกค้า</Label>
                <Input id="c-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="เช่น หมู่บ้านสวนสวย" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-slug">รหัสองค์กร (ใช้ตอน login)</Label>
                <Input
                  id="c-slug"
                  value={d.slug}
                  onChange={(e) => setD({ ...d, slug: e.target.value.toLowerCase() })}
                  placeholder="เช่น suansuay"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">a-z, 0-9, - ยาว 3–32 ตัว</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-admin">ชื่อผู้ใช้ผู้ดูแลของลูกค้า</Label>
                <Input id="c-admin" value={d.adminUsername} onChange={(e) => setD({ ...d, adminUsername: e.target.value })} className="font-mono" />
              </div>
            </div>
            <ContractFields k={k} set={setK} idp="c" village={d.mode === "VILLAGE"} />
            <fieldset className="flex flex-wrap items-end gap-4">
              <legend className="mb-2 text-sm font-medium">สถานะเริ่มต้น</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="plan" checked={d.plan === "TRIAL"} onChange={() => setD({ ...d, plan: "TRIAL" })} /> ทดลองใช้
              </label>
              {d.plan === "TRIAL" && (
                <div className="flex items-center gap-2 text-sm">
                  <Input
                    aria-label="จำนวนวันทดลองใช้"
                    type="number"
                    min={1}
                    max={365}
                    value={d.trialDays}
                    onChange={(e) => setD({ ...d, trialDays: e.target.value })}
                    className="w-20"
                  />{" "}
                  วัน
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="plan" checked={d.plan === "ACTIVE"} onChange={() => setD({ ...d, plan: "ACTIVE" })} /> ใช้งานจริง (ตามสัญญา
                ไม่มีวันหมดอายุในระบบ)
              </label>
            </fieldset>
            <div className="flex gap-2">
              <Button
                disabled={pending || d.name.trim().length < 2 || d.slug.trim().length < 3}
                onClick={() =>
                  act(
                    () =>
                      createCustomerAction({
                        ...d,
                        trialDays: Number(d.trialDays),
                        ...contractPayload(k),
                      }),
                    (r) => {
                      setSecret({
                        title: `สร้างลูกค้า “${d.name}” แล้ว`,
                        slug: r.slug,
                        username: r.username,
                        password: r.tempPassword,
                      });
                      setAdding(false);
                      setD({ ...d, name: "", slug: "" });
                      setK(EMPTY_CONTRACT);
                    },
                  )
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : <Save />} สร้างลูกค้า
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                ยกเลิก
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={() => setAdding(true)}>
          <Plus /> เพิ่มลูกค้า
        </Button>
      )}

      {editing && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle>แก้ไขสัญญา — {editing.name}</CardTitle>
            <CardDescription>
              ลดจำนวนจุดต่ำกว่าที่ใช้อยู่ได้ — จุดที่ลงทะเบียนทีหลังสุดจะหยุด Check-in จนกว่าลูกค้าจะยกเลิกจุดที่ไม่ใช้
              {editing.village && " · ลดจำนวนบ้านต่ำกว่าที่มีอยู่ได้ — บ้านเดิมยังใช้ได้ แต่เพิ่มบ้านใหม่ไม่ได้จนกว่าจะปิดใช้งานบ้านส่วนเกิน"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ContractFields k={editing.k} set={(nk) => setEditing({ ...editing, k: nk })} idp="e" village={editing.village} />
            <div className="flex gap-2">
              <Button
                disabled={pending}
                onClick={() =>
                  act(
                    () => updateCustomerContractAction(editing.id, contractPayload(editing.k)),
                    () => setEditing(null),
                  )
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : <Save />} บันทึก
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                ยกเลิก
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(expired > 0 || soon > 0) && (
        <section role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <BellRing className="size-5 shrink-0" />
          <span className="flex-1">
            ต้องติดต่อต่อสัญญา:
            {expired > 0 && <b className="text-destructive"> หมดสัญญาแล้ว {expired} ราย</b>}
            {expired > 0 && soon > 0 && " ·"}
            {soon > 0 && (
              <b>
                {" "}
                ใกล้หมดภายใน {noticeDays} วัน {soon} ราย
              </b>
            )}
          </span>
          <Button size="sm" variant="outline" onClick={() => setFilter({ ...EMPTY_FILTER, contract: "DUE" })}>
            ดูรายชื่อ
          </Button>
        </section>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor="cf-q">ค้นหา</Label>
          <Input
            id="cf-q"
            type="search"
            value={f.q}
            onChange={(e) => setFilter({ ...f, q: e.target.value })}
            placeholder="ชื่อ รหัสองค์กร อีเมล ชื่อผู้ซื้อ เลขผู้เสียภาษี"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cf-mode">ประเภท</Label>
          <NativeSelect id="cf-mode" value={f.mode} onChange={(e) => setFilter({ ...f, mode: e.target.value as CustomerFilter["mode"] })} className="w-40">
            <option value="">ทุกประเภท</option>
            {(["VILLAGE", "OFFICE", "FACTORY"] as const).map((m) => (
              <option key={m} value={m}>
                {SITE_TYPE_LABEL[m]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cf-status">สถานะ</Label>
          <NativeSelect
            id="cf-status"
            value={f.status}
            onChange={(e) => setFilter({ ...f, status: e.target.value as CustomerFilter["status"] })}
            className="w-36"
          >
            <option value="">ทุกสถานะ</option>
            <option value="TRIAL">ทดลองใช้</option>
            <option value="ACTIVE">ใช้งาน</option>
            <option value="SUSPENDED">ถูกระงับ</option>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cf-contract">สัญญา</Label>
          <NativeSelect
            id="cf-contract"
            value={f.contract}
            onChange={(e) => setFilter({ ...f, contract: e.target.value as CustomerFilter["contract"] })}
            className="w-48"
          >
            <option value="">ทั้งหมด</option>
            <option value="DUE">ต้องต่อสัญญา ({expired + soon})</option>
            <option value="EXPIRED">หมดสัญญาแล้ว</option>
            <option value="SOON">ใกล้หมด ({noticeDays} วัน)</option>
            <option value="NONE">ยังไม่ระบุวันสิ้นสุด ({noEnd})</option>
            <option value="NOTAX">ยังไม่มีข้อมูลใบกำกับภาษี</option>
          </NativeSelect>
        </div>
        {(f.q || f.mode || f.status || f.contract) && (
          <Button variant="ghost" onClick={() => setFilter(EMPTY_FILTER)}>
            ล้างตัวกรอง
          </Button>
        )}
        <Button variant="outline" asChild>
          <a href={`/platform/customers/export${filterQuery(f) ? `?${filterQuery(f)}` : ""}`} download>
            <Download /> ส่งออก Excel
          </a>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        แสดง {shown.length} จาก {customers.length} ราย{shown.length !== customers.length && " — ไฟล์ Excel จะมีเฉพาะรายการที่แสดง"}
      </p>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">ลูกค้า</th>
              <th className="p-3">ประเภท</th>
              <th className="p-3">สถานะ</th>
              <th className="p-3">สิ้นสุดสัญญา</th>
              <th className="p-3">จุด / บ้าน</th>
              <th className="p-3">ติดตั้ง</th>
              <th className="p-3">ใช้งานล่าสุด</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  ไม่พบลูกค้าตามเงื่อนไข
                </td>
              </tr>
            )}
            {shown.map((c) => (
              <tr key={c.id} className="border-t align-top">
                <td className="p-3">
                  <div className="font-medium">
                    {c.name} {c.isPlatform && <Badge variant="secondary">ผู้ให้บริการ</Badge>}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">{c.slug}</div>
                  {c.contactEmail && <div className="text-xs text-muted-foreground">{c.contactEmail}</div>}
                  {c.billing ? (
                    <div className="text-xs text-muted-foreground">
                      {c.billing.legalName} · {c.billing.branch}
                    </div>
                  ) : (
                    !c.isPlatform && <div className="text-xs text-amber-700">ยังไม่มีข้อมูลใบกำกับภาษี</div>
                  )}
                </td>
                <td className="p-3">{c.modeLabel}</td>
                <td className="p-3">
                  <Badge
                    variant={c.status === "SUSPENDED" ? "outline" : c.canCheckIn ? "default" : "secondary"}
                    className={c.status === "SUSPENDED" ? "border-destructive text-destructive" : ""}
                  >
                    {c.accessLabel}
                  </Badge>
                </td>
                <td className="p-3 text-xs">
                  {c.contractEndText && <div>{c.contractEndText}</div>}
                  <div className={CONTRACT_TONE[c.contractState]}>{c.contractLabel}</div>
                </td>
                <td className="p-3 text-xs">
                  <div className={c.activePoints > c.pointLimit ? "font-semibold text-destructive" : ""}>
                    จุด {c.activePoints} / {c.pointLimit}
                  </div>
                  {c.isVillage &&
                    (c.houseLimit == null ? (
                      <div className="text-amber-700">บ้าน {c.activeHouses} / ยังไม่กำหนด</div>
                    ) : (
                      <div className={c.activeHouses > c.houseLimit ? "font-semibold text-destructive" : ""}>
                        บ้าน {c.activeHouses} / {c.houseLimit}
                      </div>
                    ))}
                </td>
                <td className="p-3 text-xs">
                  {c.onboarded ? `${c.sites} สถานที่` : <span className="text-amber-700">รอตั้งค่าเริ่มต้น</span>}
                  <div className="text-muted-foreground">สร้าง {c.createdText}</div>
                </td>
                <td className="p-3 text-xs">{c.lastVisitText ?? "—"}</td>
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        setEditing({
                          id: c.id,
                          name: c.name,
                          village: c.isVillage,
                          k: contractOf(c),
                        })
                      }
                    >
                      <FileText /> สัญญา
                    </Button>
                    {c.admins[0] && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          confirm(`รีเซ็ตรหัสของ ${c.admins[0]} (${c.name})? ผู้ใช้จะถูกออกจากระบบทุกเครื่อง`) &&
                          act(
                            () => resetCustomerAdminAction(c.id, c.admins[0]),
                            (r) =>
                              setSecret({
                                title: `รีเซ็ตรหัสผู้ดูแลของ “${c.name}”`,
                                slug: c.slug,
                                username: c.admins[0],
                                password: r.tempPassword,
                              }),
                          )
                        }
                      >
                        <KeyRound /> รีเซ็ตรหัสผู้ดูแล
                      </Button>
                    )}
                    {!c.isPlatform &&
                      (c.status === "SUSPENDED" ? (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => resumeCustomerAction(c.id))}>
                          เปิดใช้งาน
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={pending}
                          onClick={() =>
                            confirm(`ระงับการใช้งาน ${c.name}? ผู้ใช้ทุกคนขององค์กรนี้จะเข้าระบบไม่ได้`) && act(() => suspendCustomerAction(c.id, c.slug))
                          }
                        >
                          ระงับ
                        </Button>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
