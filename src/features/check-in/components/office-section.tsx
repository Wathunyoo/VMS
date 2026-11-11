"use client";

import { useMemo, useState } from "react";
import { Building2, Home, Search, Stamp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DIRECTORY_TERMS } from "@/domain/visit/labels";
import type { CheckInDirectory } from "@/infrastructure/repositories/prisma-directory.repository";
import { Field } from "./field";

type SiteDir = CheckInDirectory[number];

/**
 * เลือกผู้ที่ต้องการพบ — อาคารสำนักงาน (บริษัท/ชั้น/พนักงาน) และหมู่บ้าน (บ้าน/ซอย/ลูกบ้าน)
 */
export function OfficeSection({
  site,
  errors,
  mode = "OFFICE",
  hostRequired = false,
  initial,
}: {
  site: SiteDir;
  errors: Record<string, string | undefined>;
  mode?: "OFFICE" | "VILLAGE";
  hostRequired?: boolean;
  /** เลือกไว้ล่วงหน้า (แขกที่ลูกบ้านแจ้งไว้) */
  initial?: { tenantId: string | null; hostId: string };
}) {
  const t = DIRECTORY_TERMS[mode];
  const village = mode === "VILLAGE";
  const Icon = village ? Home : Building2;
  const accent = village ? "village" : "office";
  const [floor, setFloor] = useState("");
  const [query, setQuery] = useState("");
  const [tenantId, setTenantId] = useState(initial?.tenantId ?? "");
  const [hostId, setHostId] = useState(initial?.hostId ?? "");

  const floors = useMemo(() => [...new Set(site.tenants.map((t) => t.floor))], [site.tenants]);
  const q = query.trim().toLowerCase();

  const tenants = site.tenants.filter(
    (x) => (!floor || x.floor === floor) && (!q || x.name.toLowerCase().includes(q)),
  );
  // ค้นหาชื่อพนักงานได้โดยตรง แม้ไม่ได้เลือกบริษัท
  const hosts = site.hosts.filter(
    (h) =>
      (!tenantId || h.tenantId === tenantId) &&
      (!q || tenantId || h.fullName.toLowerCase().includes(q) || h.department?.toLowerCase().includes(q)),
  );
  const tenantName = (id: string | null) => site.tenants.find((x) => x.id === id);

  const pickHost = (id: string) => {
    setHostId(id);
    const h = site.hosts.find((x) => x.id === id);
    if (h?.tenantId) setTenantId(h.tenantId);
  };

  return (
    <Card className={cn("border-l-4", village ? "border-l-village" : "border-l-office")}>
      <CardHeader>
        <CardTitle>
          <Icon className={cn("size-5", village ? "text-village" : "text-office")} /> {village ? "บ้าน / ลูกบ้านที่มาหา" : "ผู้เช่า / ผู้ที่ต้องการพบ"}
        </CardTitle>
        <CardDescription>
          {village ? "เลือกซอย หรือพิมพ์บ้านเลขที่ / ชื่อลูกบ้าน" : "ค้นหาบริษัทตามชั้น หรือพิมพ์ชื่อพนักงานที่ต้องการพบ"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="hostId" value={hostId} />

        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <NativeSelect value={floor} onChange={(e) => setFloor(e.target.value)} aria-label={t.group}>
            <option value="">{t.allGroups}</option>
            {floors.map((f) => (
              <option key={f} value={f}>
                {f === "-" ? "ไม่ระบุ" : `${village ? "ซอย" : "ชั้น"} ${f}`}
              </option>
            ))}
          </NativeSelect>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={t.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
          {tenants.map((x) => (
            <button
              type="button"
              key={x.id}
              aria-pressed={x.id === tenantId}
              onClick={() => {
                setTenantId(x.id === tenantId ? "" : x.id);
                setHostId("");
              }}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent",
                x.id === tenantId && (accent === "village" ? "border-village bg-village/10" : "border-office bg-office/10"),
              )}
            >
              <span className="font-medium">{village ? `บ้าน ${x.name}` : x.name}</span>
              <span className="text-xs text-muted-foreground">
                {x.floor !== "-" && `${village ? "ซอย" : "ชั้น"} ${x.floor}`}
                {x.unit && ` · ${x.unit}`}
              </span>
            </button>
          ))}
          {tenants.length === 0 && <p className="text-sm text-muted-foreground">{village ? "ไม่พบบ้าน" : "ไม่พบบริษัท"}</p>}
        </div>

        <Field id="hostSelect" label={t.person} required={hostRequired} error={errors.hostId}>
          <NativeSelect id="hostSelect" value={hostId} onChange={(e) => pickHost(e.target.value)} aria-invalid={!!errors.hostId}>
            <option value="">{village ? "— ไม่ระบุ / มาที่บ้าน —" : "— ไม่ระบุ / ติดต่อบริษัท —"}</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.fullName}
                {h.department && ` (${h.department})`}
                {!tenantId && tenantName(h.tenantId) && ` — ${village ? "บ้าน " : ""}${tenantName(h.tenantId)!.name}`}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <div className="flex items-start gap-3 rounded-md bg-muted p-3">
          <Switch id="requireStamp" name="requireStamp" defaultChecked disabled={!hostId} />
          <div className="space-y-1">
            <Label htmlFor="requireStamp" className="flex items-center gap-1.5">
              <Stamp className="size-4" /> {village ? "ขอให้ลูกบ้านยืนยัน (E-Stamp)" : "ขอ E-Stamp จาก Host"}
            </Label>
            <p className="text-xs text-muted-foreground">
              {village
                ? "แจ้งลูกบ้านทาง LINE ให้ยืนยันว่ามาหาจริง (หรือใช้ OTP) ก่อนออกจากหมู่บ้าน"
                : "แจ้ง Host ทาง LINE ให้ยืนยันว่าผู้ติดต่อมาพบจริง (หรือใช้ OTP) ก่อนออกจากอาคาร"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
