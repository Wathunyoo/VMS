import Link from "next/link";
import { AlertTriangle, Car, Clock, Download, LogIn, Search, UserCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { addDays, bangkokDate } from "@/domain/reports/range";
import { formatDuration } from "@/domain/visit/stay";
import type { SiteMode } from "@/domain/visit/types";
import { cn } from "@/lib/utils";

/** หน้ารายงาน (server component) — ตัวกรองเป็น GET form ใช้ได้แม้ไม่มี JavaScript */

export interface HistoryView {
  id: string;
  passCode: string;
  siteName: string;
  mode: SiteMode;
  checkInText: string;
  checkOutText: string | null;
  durationText: string | null;
  overstay: boolean;
  status: string;
  statusLabel: string;
  visitorName: string;
  purged: boolean;
  company: string | null;
  purposeLabel: string;
  visiting: string;
  hostName: string | null;
  plate: string | null;
  /** ภาพป้ายทะเบียน — ส่งมาเฉพาะเมื่อผู้ดูเป็นผู้ดูแลระบบ */
  platePhotoUrl: string | null;
  custom: string;
}

interface Filter {
  from: string;
  to: string;
  site: string;
  purpose: string;
  status: string;
  q: string;
}

interface Props {
  filter: Filter;
  sites: { id: string; label: string }[];
  purposes: { value: string; label: string }[];
  overview: {
    summary: { total: number; uniqueVisitors: number; withVehicle: number; avgMinutes: number | null; overstay: number; stillInside: number };
    daily: { day: string; count: number }[];
    hourly: { hour: number; count: number }[];
    byPurpose: { label: string; count: number }[];
    topUnits: { label: string; count: number }[];
  };
  history: { rows: HistoryView[]; total: number; page: number; pages: number };
  canExport: boolean;
}

const qs = (f: Partial<Filter> & { page?: number }) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "" && !(k === "status" && v === "ALL") && !(k === "page" && v === 1)) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

const dayLabel = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
const shortDay = (ymd: string) => dayLabel.format(new Date(`${ymd}T12:00:00+07:00`));

export function ReportView({ filter, sites, purposes, overview, history, canExport }: Props) {
  const today = bangkokDate(new Date());
  const monthStart = `${today.slice(0, 8)}01`;
  const presets = [
    { label: "วันนี้", from: today, to: today },
    { label: "7 วัน", from: addDays(today, -6), to: today },
    { label: "30 วัน", from: addDays(today, -29), to: today },
    { label: "เดือนนี้", from: monthStart, to: today },
  ];
  const base = { site: filter.site, purpose: filter.purpose };
  const s = overview.summary;

  return (
    <div className="space-y-5">
      {/* ---------- ตัวกรอง ---------- */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <Link
                key={p.label}
                href={`/reports${qs({ ...base, from: p.from, to: p.to })}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm hover:bg-accent",
                  filter.from === p.from && filter.to === p.to && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {p.label}
              </Link>
            ))}
          </div>
          <form method="get" action="/reports" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[150px_150px_1fr_1fr_auto] lg:items-end">
            <div className="space-y-1">
              <Label htmlFor="from">ตั้งแต่</Label>
              <Input id="from" name="from" type="date" defaultValue={filter.from} max={today} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">ถึง</Label>
              <Input id="to" name="to" type="date" defaultValue={filter.to} max={today} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="site">สถานที่</Label>
              <NativeSelect id="site" name="site" defaultValue={filter.site}>
                <option value="">ทุกสถานที่</option>
                {sites.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="purpose">วัตถุประสงค์</Label>
              <NativeSelect id="purpose" name="purpose" defaultValue={filter.purpose}>
                <option value="">ทั้งหมด</option>
                {purposes.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit">ดูรายงาน</Button>
          </form>
        </CardContent>
      </Card>

      {/* ---------- สรุป ---------- */}
      <section aria-label="สรุป" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat icon={LogIn} label="ครั้งที่เข้า" value={s.total.toLocaleString()} />
        <Stat icon={Users} label="ผู้มาติดต่อ (คน)" value={s.uniqueVisitors.toLocaleString()} />
        <Stat icon={Car} label="มาพร้อมรถ" value={s.withVehicle.toLocaleString()} />
        <Stat icon={Clock} label="อยู่เฉลี่ย" value={s.avgMinutes != null ? formatDuration(s.avgMinutes) : "—"} />
        <Stat icon={AlertTriangle} label="อยู่เกินเวลา" value={s.overstay.toLocaleString()} warn={s.overstay > 0} />
        <Stat icon={UserCheck} label="อยู่ในพื้นที่ตอนนี้" value={s.stillInside.toLocaleString()} />
      </section>

      {/* ---------- กราฟ ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>จำนวนผู้มาติดต่อรายวัน</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={overview.daily.map((d) => ({ key: d.day, label: shortDay(d.day), value: d.count }))}
              labelEvery={Math.ceil(overview.daily.length / 15)}
              height={180}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>ช่วงเวลาที่มาเข้าพื้นที่</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={overview.hourly.map((h) => ({ key: String(h.hour), label: `${String(h.hour).padStart(2, "0")}:00`, value: h.count }))} labelEvery={3} height={140} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>วัตถุประสงค์</CardTitle>
          </CardHeader>
          <CardContent>
            <HBars data={overview.byPurpose} />
          </CardContent>
        </Card>
        {overview.topUnits.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>บริษัท / บ้าน ที่มีผู้มาติดต่อมากที่สุด</CardTitle>
            </CardHeader>
            <CardContent>
              <HBars data={overview.topUnits} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* ---------- ประวัติ ---------- */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>ประวัติเข้า-ออก ({history.total.toLocaleString()} รายการ)</CardTitle>
          {canExport && history.total > 0 && (
            <Button variant="outline" asChild>
              <a href={`/reports/export${qs({ ...filter, page: undefined })}`} download>
                <Download /> ดาวน์โหลด Excel (CSV)
              </a>
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <form method="get" action="/reports" className="flex flex-wrap items-end gap-2">
            {(["from", "to", "site", "purpose"] as const).map((k) => filter[k] && <input key={k} type="hidden" name={k} value={filter[k]} />)}
            <div className="relative min-w-60 flex-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input aria-label="ค้นหา" name="q" defaultValue={filter.q} className="pl-8" placeholder="ชื่อ / บริษัท / ทะเบียนรถ / รหัสบัตร / บ้านเลขที่ / ผู้รับพบ" />
            </div>
            <NativeSelect aria-label="สถานะ" name="status" defaultValue={filter.status} className="w-auto">
              <option value="ALL">ทุกสถานะ</option>
              <option value="INSIDE">อยู่ในพื้นที่</option>
              <option value="OUT">ออกแล้ว</option>
            </NativeSelect>
            <Button type="submit" variant="secondary">
              ค้นหา
            </Button>
          </form>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">เวลาเข้า / ออก</th>
                  <th className="p-2">ผู้มาติดต่อ</th>
                  <th className="p-2">ติดต่อ</th>
                  <th className="p-2">วัตถุประสงค์</th>
                  <th className="p-2">ทะเบียนรถ</th>
                  <th className="p-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      ไม่พบรายการ
                    </td>
                  </tr>
                )}
                {history.rows.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="p-2 whitespace-nowrap">
                      <div>{r.checkInText}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.checkOutText ? `ออก ${r.checkOutText}` : "—"}
                        {r.durationText && ` · ${r.durationText}`}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{r.purged ? <span className="text-muted-foreground">(ลบตาม PDPA)</span> : r.visitorName}</div>
                      <div className="text-xs text-muted-foreground">
                        {[r.company, r.passCode].filter(Boolean).join(" · ")}
                      </div>
                      {r.custom && <div className="text-xs text-muted-foreground">{r.custom}</div>}
                    </td>
                    <td className="p-2">
                      <div>{r.visiting}</div>
                      <div className="text-xs text-muted-foreground">{[r.hostName, r.siteName].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="p-2">{r.purposeLabel}</td>
                    <td className="p-2 font-mono text-xs">
                      {r.plate ?? "—"}
                      {r.platePhotoUrl && (
                        <a href={r.platePhotoUrl} target="_blank" rel="noreferrer" title="เปิดภาพป้ายทะเบียน" className="mt-1 block w-28 overflow-hidden rounded border hover:ring-2 hover:ring-primary">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r.platePhotoUrl} alt={`ภาพป้ายทะเบียน ${r.plate ?? ""}`} loading="lazy" className="aspect-video w-full object-cover" />
                        </a>
                      )}
                    </td>
                    <td className="p-2">
                      <Badge variant={r.status === "CHECKED_IN" ? "default" : "secondary"}>{r.statusLabel}</Badge>
                      {r.overstay && (
                        <Badge variant="outline" className="ml-1 border-destructive text-destructive">
                          เกินเวลา
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {history.pages > 1 && (
            <nav aria-label="หน้า" className="flex items-center justify-center gap-2 text-sm">
              {history.page > 1 && (
                <Link className="rounded-md border px-3 py-1 hover:bg-accent" href={`/reports${qs({ ...filter, page: history.page - 1 })}`}>
                  ก่อนหน้า
                </Link>
              )}
              <span>
                หน้า {history.page} / {history.pages}
              </span>
              {history.page < history.pages && (
                <Link className="rounded-md border px-3 py-1 hover:bg-accent" href={`/reports${qs({ ...filter, page: history.page + 1 })}`}>
                  ถัดไป
                </Link>
              )}
            </nav>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, warn }: { icon: typeof Users; label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3", warn && "border-destructive/50 bg-destructive/5")}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className={cn("mt-1 text-2xl font-bold", warn && "text-destructive")}>{value}</p>
    </div>
  );
}

function BarChart({ data, labelEvery, height }: { data: { key: string; label: string; value: number }[]; labelEvery: number; height: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.every((d) => d.value === 0)) return <p className="py-8 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงนี้</p>;
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }} role="list" aria-label="กราฟแท่ง">
        {data.map((d) => (
          <div key={d.key} role="listitem" aria-label={`${d.label}: ${d.value}`} title={`${d.label}: ${d.value}`} className="group flex h-full flex-1 flex-col justify-end">
            <span className="mb-0.5 hidden text-center text-[10px] text-muted-foreground group-hover:block">{d.value}</span>
            <div className="min-h-[2px] rounded-t bg-primary/80 group-hover:bg-primary" style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-muted-foreground">
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 truncate text-center">
            {i % labelEvery === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function HBars({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  if (data.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงนี้</p>;
  return (
    <ul className="space-y-1.5">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(0,40%)_1fr_auto] items-center gap-2 text-sm">
          <span className="truncate" title={d.label}>
            {d.label}
          </span>
          <span className="h-3 rounded bg-muted">
            <span className="block h-3 rounded bg-primary/80" style={{ width: `${(d.count / max) * 100}%` }} />
          </span>
          <span className="w-10 text-right tabular-nums">{d.count.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}
