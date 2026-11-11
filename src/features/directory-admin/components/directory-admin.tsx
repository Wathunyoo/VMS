"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Factory, Home, Loader2, MessageCircle, Pencil, Plus, Save, Search, Upload } from "lucide-react";
import type { BayRow, PersonRow, SiteRow, UnitRow } from "@/application/directory/directory-admin.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StayLimitInput, stayHoursValue } from "@/components/stay-limit-input";
import { DIRECTORY_TERMS, SITE_TYPE_LABEL } from "@/domain/visit/labels";
import type { SiteMode } from "@/domain/visit/types";
import { cn } from "@/lib/utils";
import {
  createSiteAction,
  importDirectoryAction,
  saveBayAction,
  savePersonAction,
  saveUnitAction,
  setBayActiveAction,
  setPersonActiveAction,
  setUnitActiveAction,
  updateSiteAction,
} from "../actions";

interface Props {
  /** โหมดขององค์กร — สถานที่ใหม่ใช้โหมดนี้เสมอ */
  orgMode: SiteMode | null;
  sites: SiteRow[];
  site: SiteRow | null;
  units: UnitRow[];
  people: PersonRow[];
  bays: BayRow[];
  /** จำนวนบ้านตามสัญญา (หมู่บ้าน) — limit null = ไม่จำกัด */
  houseQuota: { limit: number | null; used: number };
  initialTab?: string;
}

type Tab = "units" | "people" | "bays" | "import" | "site";
const MODE_ICON = { OFFICE: Building2, FACTORY: Factory, VILLAGE: Home } as const;
type ActionResult = { ok: true; data: unknown } | { ok: false; error: string };

export function DirectoryAdmin({ orgMode, sites, site, units, people, bays, houseQuota, initialTab }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addingSite, setAddingSite] = useState(sites.length === 0);
  const tabs = useMemo(() => {
    if (!site) return [] as { id: Tab; label: string }[];
    const t = DIRECTORY_TERMS[site.mode];
    const list: { id: Tab; label: string }[] = [
      { id: "units", label: `${t.unit} (${units.filter((u) => u.isActive).length})` },
      { id: "people", label: `${site.mode === "VILLAGE" ? "ลูกบ้าน" : "ผู้รับพบ"} (${people.filter((p) => p.isActive).length})` },
    ];
    if (site.mode === "FACTORY") list.push({ id: "bays", label: `จุดขนถ่ายสินค้า (${bays.filter((b) => b.isActive).length})` });
    list.push({ id: "import", label: "นำเข้าจาก Excel" }, { id: "site", label: "ตั้งค่าสถานที่" });
    return list;
  }, [site, units, people, bays]);
  const [tab, setTab] = useState<Tab>((tabs.find((t) => t.id === initialTab)?.id ?? (site?.mode === "FACTORY" ? "people" : "units")) as Tab);

  const act: Act = (fn, okText, after) => {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error);
      if (okText) setNotice(typeof okText === "function" ? okText(r.data) : okText);
      after?.(r.data);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {/* ---------- สถานที่ ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        {sites.map((s) => {
          const Icon = MODE_ICON[s.mode];
          return (
            <Link
              key={s.id}
              href={`/admin/directory?site=${s.id}`}
              aria-current={s.id === site?.id ? "page" : undefined}
              className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent", s.id === site?.id && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}
            >
              <Icon className="size-4" />
              <span className="font-medium">{s.name}</span>
              <span className="text-xs opacity-75">{SITE_TYPE_LABEL[s.mode]}</span>
            </Link>
          );
        })}
        {!addingSite && (
          <Button variant="outline" onClick={() => setAddingSite(true)}>
            <Plus /> เพิ่มสถานที่
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-md border border-green-600/40 bg-green-50 px-4 py-2 text-sm text-green-900">
          <CheckCircle2 className="size-4" /> {notice}
        </p>
      )}

      {addingSite && (
        <NewSiteForm
          orgMode={orgMode}
          pending={pending}
          onCancel={sites.length ? () => setAddingSite(false) : undefined}
          onSave={(s) =>
            act(() => createSiteAction(s), "เพิ่มสถานที่แล้ว", (id) => {
              setAddingSite(false);
              router.push(`/admin/directory?site=${id}`);
            })
          }
        />
      )}

      {site && (
        <>
          <div role="tablist" className="flex flex-wrap gap-1 border-b">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === t.id ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "units" && <UnitsTab site={site} units={units} houseQuota={houseQuota} pending={pending} act={act} />}
          {tab === "people" && <PeopleTab site={site} units={units} people={people} pending={pending} act={act} />}
          {tab === "bays" && <BaysTab site={site} bays={bays} pending={pending} act={act} />}
          {tab === "import" && <ImportTab site={site} pending={pending} act={act} />}
          {tab === "site" && <SiteTab site={site} pending={pending} act={act} />}
        </>
      )}
    </div>
  );
}

type Act = (fn: () => Promise<ActionResult>, okText?: string | ((data: unknown) => string), after?: (data: unknown) => void) => void;

function useSearch<T>(rows: T[], text: (r: T) => string) {
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  return { q, setQ, rows: s ? rows.filter((r) => text(r).toLowerCase().includes(s)) : rows };
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative max-w-sm flex-1">
      <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
      <Input className="pl-8" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// ---------------- บริษัท / บ้าน ----------------

function UnitsTab({
  site,
  units,
  houseQuota,
  pending,
  act,
}: {
  site: SiteRow;
  units: UnitRow[];
  houseQuota: Props["houseQuota"];
  pending: boolean;
  act: Act;
}) {
  const t = DIRECTORY_TERMS[site.mode];
  const village = site.mode === "VILLAGE";
  const office = site.mode === "OFFICE";
  const quota = village && houseQuota.limit != null ? houseQuota : null;
  const full = !!quota && quota.used >= quota.limit!;
  const { q, setQ, rows } = useSearch(units, (u) => `${u.name} ${u.floor} ${u.unit ?? ""}`);
  const [edit, setEdit] = useState<string | "new" | null>(null);
  const [d, setD] = useState({ name: "", floor: "", unit: "", phone: "" });
  const open = (u?: UnitRow) => {
    setEdit(u?.id ?? "new");
    setD(u ? { name: u.name, floor: u.floor === "-" ? "" : u.floor, unit: u.unit ?? "", phone: u.phone ?? "" } : { name: "", floor: "", unit: "", phone: "" });
  };
  const save = (id: string | null) => act(() => saveUnitAction(site.id, id, d), id ? "บันทึกแล้ว" : `เพิ่ม${t.unit}แล้ว`, () => setEdit(null));

  const form = (id: string | null) => (
    <div className="grid gap-3 rounded-lg border-2 border-primary p-3 sm:grid-cols-[1fr_140px_140px_160px_auto] sm:items-end">
      <div className="space-y-1">
        <Label htmlFor="u-name">{t.unitName}</Label>
        <Input id="u-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder={village ? "99/12" : office ? "บจก. อัลฟ่า" : "อาคาร A"} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="u-floor">{t.group}</Label>
        <Input id="u-floor" value={d.floor} onChange={(e) => setD({ ...d, floor: e.target.value })} placeholder={village ? "3" : office ? "12" : "-"} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="u-unit">{village ? "หมายเหตุ" : office ? "ห้อง/ยูนิต" : "หมายเหตุ"}</Label>
        <Input id="u-unit" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="u-phone">เบอร์โทร</Label>
        <Input id="u-phone" type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
      </div>
      <div className="flex gap-1">
        <Button disabled={pending || !d.name.trim()} onClick={() => save(id)}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} บันทึก
        </Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SearchBox value={q} onChange={setQ} placeholder={`ค้นหา${t.unitName}`} />
          <div className="flex items-center gap-3">
            {quota && (
              <span className={full ? "text-sm font-medium text-amber-800" : "text-sm text-muted-foreground"}>
                บ้าน {quota.used} / {quota.limit} หลังตามสัญญา
              </span>
            )}
            <Button variant="outline" disabled={edit !== null || full} onClick={() => open()}>
              <Plus /> เพิ่ม{t.unit}
            </Button>
          </div>
        </div>
        {full && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            ครบจำนวนบ้านตามสัญญาแล้ว — ปิดใช้งานบ้านที่ไม่ใช้ หรือติดต่อผู้ให้บริการเพื่อเพิ่มจำนวนบ้าน
          </p>
        )}
        {edit === "new" && form(null)}
        <div className="divide-y rounded-lg border">
          {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีรายการ</p>}
          {rows.map((u) =>
            edit === u.id ? (
              <div key={u.id} className="p-2">
                {form(u.id)}
              </div>
            ) : (
              <div key={u.id} className={cn("flex flex-wrap items-center gap-3 px-3 py-2", !u.isActive && "bg-muted/50 text-muted-foreground")}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {village ? `บ้าน ${u.name}` : u.name}
                    {!u.isActive && <Badge variant="outline" className="ml-2">ปิดใช้งาน</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[u.floor !== "-" && `${t.group.split(" ")[0]} ${u.floor}`, u.unit, u.phone, `${village ? "ลูกบ้าน" : "ผู้รับพบ"} ${u.people} คน`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Switch checked={u.isActive} aria-label={`เปิดใช้ ${u.name}`} disabled={pending} onCheckedChange={(v) => act(() => setUnitActiveAction(u.id, v))} />
                <Button size="sm" variant="ghost" disabled={edit !== null} onClick={() => open(u)}>
                  <Pencil /> แก้ไข
                </Button>
              </div>
            ),
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- ผู้รับพบ / ลูกบ้าน ----------------

function PeopleTab({ site, units, people, pending, act }: { site: SiteRow; units: UnitRow[]; people: PersonRow[]; pending: boolean; act: Act }) {
  const t = DIRECTORY_TERMS[site.mode];
  const village = site.mode === "VILLAGE";
  const unitById = new Map(units.map((u) => [u.id, u]));
  const unitText = (id: string | null) => {
    const u = id ? unitById.get(id) : null;
    return u ? (village ? `บ้าน ${u.name}` : u.name) : null;
  };
  const { q, setQ, rows } = useSearch(people, (p) => `${p.fullName} ${p.department ?? ""} ${unitText(p.tenantId) ?? ""} ${p.phone ?? ""}`);
  const [edit, setEdit] = useState<string | "new" | null>(null);
  const empty = { fullName: "", department: "", tenantId: "", phone: "", email: "" };
  const [d, setD] = useState(empty);
  const open = (p?: PersonRow) => {
    setEdit(p?.id ?? "new");
    setD(p ? { fullName: p.fullName, department: p.department ?? "", tenantId: p.tenantId ?? "", phone: p.phone ?? "", email: p.email ?? "" } : empty);
  };
  const activeUnits = units.filter((u) => u.isActive);

  const form = (id: string | null) => (
    <div className="grid gap-3 rounded-lg border-2 border-primary p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_140px_180px]">
      <div className="space-y-1">
        <Label htmlFor="p-name">ชื่อ-นามสกุล</Label>
        <Input id="p-name" value={d.fullName} onChange={(e) => setD({ ...d, fullName: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="p-unit">{t.unit}</Label>
        <NativeSelect id="p-unit" value={d.tenantId} onChange={(e) => setD({ ...d, tenantId: e.target.value })}>
          <option value="">{village ? "— เลือกบ้าน —" : "— ไม่ระบุ —"}</option>
          {activeUnits.map((u) => (
            <option key={u.id} value={u.id}>
              {village ? `บ้าน ${u.name}` : u.name}
              {u.floor !== "-" ? ` (${village ? "ซอย" : site.mode === "OFFICE" ? "ชั้น" : "โซน"} ${u.floor})` : ""}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="p-dept">{village ? "ความสัมพันธ์ / หมายเหตุ" : "แผนก"}</Label>
        <Input id="p-dept" value={d.department} onChange={(e) => setD({ ...d, department: e.target.value })} placeholder={village ? "เจ้าของบ้าน / ผู้เช่า" : ""} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="p-phone">เบอร์โทร</Label>
        <Input id="p-phone" type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="p-email">อีเมล</Label>
        <Input id="p-email" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
      </div>
      <div className="flex gap-1 sm:col-span-2 lg:col-span-5">
        <Button disabled={pending || d.fullName.trim().length < 2} onClick={() => act(() => savePersonAction(site.id, id, d), id ? "บันทึกแล้ว" : "เพิ่มแล้ว", () => setEdit(null))}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} บันทึก
        </Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{t.personHint} — เชื่อม LINE ได้ที่เมนู “LINE”</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SearchBox value={q} onChange={setQ} placeholder={village ? "ค้นหาชื่อ / บ้านเลขที่" : "ค้นหาชื่อ / แผนก / บริษัท"} />
          <Button variant="outline" disabled={edit !== null} onClick={() => open()}>
            <Plus /> เพิ่ม{village ? "ลูกบ้าน" : "ผู้รับพบ"}
          </Button>
        </div>
        {edit === "new" && form(null)}
        <div className="divide-y rounded-lg border">
          {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีรายการ</p>}
          {rows.map((p) =>
            edit === p.id ? (
              <div key={p.id} className="p-2">
                {form(p.id)}
              </div>
            ) : (
              <div key={p.id} className={cn("flex flex-wrap items-center gap-3 px-3 py-2", !p.isActive && "bg-muted/50 text-muted-foreground")}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {p.fullName}
                    {p.lineLinked && (
                      <Badge variant="secondary" className="ml-2">
                        <MessageCircle className="size-3" /> LINE
                      </Badge>
                    )}
                    {!p.isActive && <Badge variant="outline" className="ml-2">ปิดใช้งาน</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">{[unitText(p.tenantId), p.department, p.phone, p.email].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <Switch checked={p.isActive} aria-label={`เปิดใช้ ${p.fullName}`} disabled={pending} onCheckedChange={(v) => act(() => setPersonActiveAction(p.id, v))} />
                <Button size="sm" variant="ghost" disabled={edit !== null} onClick={() => open(p)}>
                  <Pencil /> แก้ไข
                </Button>
              </div>
            ),
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- จุดขนถ่าย ----------------

function BaysTab({ site, bays, pending, act }: { site: SiteRow; bays: BayRow[]; pending: boolean; act: Act }) {
  const [edit, setEdit] = useState<string | "new" | null>(null);
  const [d, setD] = useState({ code: "", name: "", zone: "" });
  const open = (b?: BayRow) => {
    setEdit(b?.id ?? "new");
    setD(b ? { code: b.code, name: b.name, zone: b.zone ?? "" } : { code: "", name: "", zone: "" });
  };
  const form = (id: string | null) => (
    <div className="grid gap-3 rounded-lg border-2 border-primary p-3 sm:grid-cols-[140px_1fr_160px_auto] sm:items-end">
      <div className="space-y-1">
        <Label htmlFor="b-code">รหัส</Label>
        <Input id="b-code" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} placeholder="LB-01" className="uppercase" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="b-name">ชื่อ</Label>
        <Input id="b-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="รับวัตถุดิบ" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="b-zone">โซน</Label>
        <Input id="b-zone" value={d.zone} onChange={(e) => setD({ ...d, zone: e.target.value })} />
      </div>
      <div className="flex gap-1">
        <Button disabled={pending || !d.code.trim()} onClick={() => act(() => saveBayAction(site.id, id, d), "บันทึกแล้ว", () => setEdit(null))}>
          <Save /> บันทึก
        </Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex justify-end">
          <Button variant="outline" disabled={edit !== null} onClick={() => open()}>
            <Plus /> เพิ่มจุดขนถ่าย
          </Button>
        </div>
        {edit === "new" && form(null)}
        <div className="divide-y rounded-lg border">
          {bays.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">ยังไม่มีรายการ</p>}
          {bays.map((b) =>
            edit === b.id ? (
              <div key={b.id} className="p-2">
                {form(b.id)}
              </div>
            ) : (
              <div key={b.id} className={cn("flex items-center gap-3 px-3 py-2", !b.isActive && "bg-muted/50 text-muted-foreground")}>
                <span className="font-mono font-semibold">{b.code}</span>
                <span className="flex-1">
                  {b.name}
                  {b.zone && <span className="text-xs text-muted-foreground"> · {b.zone}</span>}
                </span>
                <Switch checked={b.isActive} aria-label={`เปิดใช้ ${b.code}`} disabled={pending} onCheckedChange={(v) => act(() => setBayActiveAction(b.id, v))} />
                <Button size="sm" variant="ghost" disabled={edit !== null} onClick={() => open(b)}>
                  <Pencil /> แก้ไข
                </Button>
              </div>
            ),
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- นำเข้า ----------------

function ImportTab({ site, pending, act }: { site: SiteRow; pending: boolean; act: Act }) {
  const [text, setText] = useState({ tenants: "", hosts: "", bays: "" });
  const mode = site.mode;
  const cfg: Record<SiteMode, { tenants?: [string, string]; hosts: [string, string]; bays?: [string, string] }> = {
    OFFICE: {
      tenants: ["บริษัทผู้เช่า — ชั้น, ชื่อบริษัท", "12, บจก. อัลฟ่า เทคโนโลยี\n18, Beta Consulting"],
      hosts: ["ผู้รับพบ — ชื่อ-นามสกุล, แผนก, ชื่อบริษัท", "วิภา ใจดี, ฝ่ายขาย, บจก. อัลฟ่า เทคโนโลยี"],
    },
    VILLAGE: {
      tenants: ["บ้าน — บ้านเลขที่, ซอย/โซน", "99/1, 1\n99/2, 1\n99/15, 2"],
      hosts: ["ลูกบ้าน — ชื่อ-นามสกุล, บ้านเลขที่", "สมชาย ใจดี, 99/1\nมาลี รักบ้าน, 99/15"],
    },
    FACTORY: {
      hosts: ["ผู้รับพบ — ชื่อ-นามสกุล, แผนก", "วิชัย ปลอดภัย, Safety"],
      bays: ["จุดขนถ่าย — รหัส, ชื่อ", "LB-01, รับวัตถุดิบ\nLB-02, ส่งสินค้า"],
    },
  };
  const c = cfg[mode];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Upload className="size-5" /> นำเข้าจาก Excel
        </CardTitle>
        <CardDescription>คัดลอกคอลัมน์จาก Excel มาวาง (บรรทัดละรายการ คั่นด้วย Tab หรือ ,) — รายการที่ชื่อซ้ำกับที่มีอยู่จะถูกข้าม</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {c.tenants && (
          <div className="space-y-1.5">
            <Label htmlFor="imp-t">{c.tenants[0]}</Label>
            <Textarea id="imp-t" rows={6} value={text.tenants} onChange={(e) => setText({ ...text, tenants: e.target.value })} placeholder={c.tenants[1]} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="imp-h">{c.hosts[0]}</Label>
          <Textarea id="imp-h" rows={6} value={text.hosts} onChange={(e) => setText({ ...text, hosts: e.target.value })} placeholder={c.hosts[1]} />
        </div>
        {c.bays && (
          <div className="space-y-1.5">
            <Label htmlFor="imp-b">{c.bays[0]}</Label>
            <Textarea id="imp-b" rows={4} value={text.bays} onChange={(e) => setText({ ...text, bays: e.target.value })} placeholder={c.bays[1]} />
          </div>
        )}
        <Button
          disabled={pending || !(text.tenants.trim() || text.hosts.trim() || text.bays.trim())}
          onClick={() =>
            act(
              () => importDirectoryAction(site.id, text),
              (data) => {
                const r = data as { units: number; people: number; bays: number; skipped: number };
                return `นำเข้าแล้ว: ${mode === "VILLAGE" ? "บ้าน" : mode === "OFFICE" ? "บริษัท" : "อาคาร"} ${r.units} · ${mode === "VILLAGE" ? "ลูกบ้าน" : "ผู้รับพบ"} ${r.people}${r.bays ? ` · จุดขนถ่าย ${r.bays}` : ""}${r.skipped ? ` (ข้ามรายการซ้ำ ${r.skipped})` : ""}`;
              },
              () => setText({ tenants: "", hosts: "", bays: "" }),
            )
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Upload />} นำเข้า
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------- ตั้งค่าสถานที่ ----------------

function SiteTab({ site, pending, act }: { site: SiteRow; pending: boolean; act: Act }) {
  const [d, setD] = useState({
    name: site.name,
    hours: site.defaultMaxStayMinutes == null ? "" : String(site.defaultMaxStayMinutes / 60),
    induction: site.inductionVersion ?? "",
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>ตั้งค่าสถานที่</CardTitle>
        <CardDescription>
          ประเภท: {SITE_TYPE_LABEL[site.mode]} · รหัส {site.code} (เปลี่ยนประเภทไม่ได้ — ถ้าต้องการให้เพิ่มสถานที่ใหม่)
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-[1fr_180px_200px] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="s-name">ชื่อสถานที่</Label>
          <Input id="s-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <StayLimitInput id="s-hours" value={d.hours} onChange={(hours) => setD({ ...d, hours })} />
        {site.mode === "FACTORY" ? (
          <div className="space-y-1">
            <Label htmlFor="s-ind">เวอร์ชัน Safety Induction</Label>
            <Input id="s-ind" value={d.induction} onChange={(e) => setD({ ...d, induction: e.target.value })} placeholder="เช่น v2026.1" />
          </div>
        ) : (
          <span />
        )}
        <Button
          className="sm:col-span-3 sm:justify-self-start"
          disabled={pending}
          onClick={() => act(() => updateSiteAction(site.id, { name: d.name, maxStayHours: stayHoursValue(d.hours), inductionVersion: d.induction }), "บันทึกแล้ว")}
        >
          <Save /> บันทึก
        </Button>
      </CardContent>
    </Card>
  );
}

function NewSiteForm({
  orgMode,
  pending,
  onSave,
  onCancel,
}: {
  orgMode: SiteMode | null;
  pending: boolean;
  onSave: (s: { name: string; mode: SiteMode; maxStayHours: number | null }) => void;
  onCancel?: () => void;
}) {
  const [mode, setMode] = useState<SiteMode>(orgMode ?? "OFFICE");
  const [name, setName] = useState("");
  const [hours, setHours] = useState("8");
  return (
    <Card className="border-2 border-primary">
      <CardHeader>
        <CardTitle>เพิ่มสถานที่</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {orgMode ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {(() => {
              const Icon = MODE_ICON[orgMode];
              return <Icon className="size-4" />;
            })()}
            ประเภท: {SITE_TYPE_LABEL[orgMode]} (ตามโหมดขององค์กร)
          </p>
        ) : (
          <div role="radiogroup" aria-label="ประเภทสถานที่" className="grid gap-2 sm:grid-cols-3">
            {(["OFFICE", "FACTORY", "VILLAGE"] as const).map((m) => {
              const Icon = MODE_ICON[m];
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn("flex items-center gap-2 rounded-lg border-2 p-3 text-left", mode === m ? "border-primary bg-primary/5" : "border-border")}
                >
                  <Icon className="size-5" /> {SITE_TYPE_LABEL[m]}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div className="space-y-1">
            <Label htmlFor="ns-name">ชื่อสถานที่</Label>
            <Input id="ns-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <StayLimitInput id="ns-hours" value={hours} onChange={setHours} />
        </div>
        <div className="flex gap-2">
          <Button disabled={pending || name.trim().length < 2} onClick={() => onSave({ name, mode, maxStayHours: stayHoursValue(hours) })}>
            <Save /> เพิ่มสถานที่
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              ยกเลิก
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
