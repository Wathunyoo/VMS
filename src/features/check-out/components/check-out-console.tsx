"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Building2, Camera, CameraOff, CheckCircle2, Factory, Home, Loader2, RefreshCw, ScanLine, Search, Stamp, Users } from "lucide-react";
import type { ActiveVisitItem, CheckOutPreview } from "@/application/check-out/check-out.types";
import type { CheckOutResult } from "@/application/check-out/check-out.usecase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/domain/visit/stay";
import { cn } from "@/lib/utils";
import { listActiveVisitsAction, lookupVisitAction } from "../actions";
import { QrScanner } from "./qr-scanner";
import { VisitPanel } from "./visit-panel";

export function CheckOutConsole({ initialActive }: { initialActive: ActiveVisitItem[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [ref, setRef] = useState("");
  const [camera, setCamera] = useState(false);
  const [preview, setPreview] = useState<CheckOutPreview | null>(null);
  const [done, setDone] = useState<CheckOutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(initialActive);
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();

  // ช่องสแกนพร้อมรับค่าเสมอ (รองรับเครื่องสแกนบาร์โค้ดแบบ USB ที่พิมพ์ค่าแล้วกด Enter)
  useEffect(() => inputRef.current?.focus(), []);

  const refreshActive = () =>
    startTransition(async () => {
      const r = await listActiveVisitsAction();
      if (r.ok) setActive(r.data);
    });

  // อัปเดตรายชื่อทุก 1 นาที เพื่อให้สถานะ "เกินเวลา" เป็นปัจจุบัน
  useEffect(() => {
    const t = setInterval(refreshActive, 60_000);
    return () => clearInterval(t);
  }, []);

  const lookup = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setError(null);
    setDone(null);
    setCamera(false);
    startTransition(async () => {
      const r = await lookupVisitAction(v);
      if (r.ok) {
        setPreview(r.data);
        setRef("");
      } else {
        setPreview(null);
        setError(r.error);
      }
    });
  };

  const reset = () => {
    setPreview(null);
    setDone(null);
    setError(null);
    setRef("");
    inputRef.current?.focus();
  };

  const q = filter.trim().toLowerCase();
  const shown = active.filter(
    (a) =>
      !q ||
      a.visitorName.toLowerCase().includes(q) ||
      a.passCode.toLowerCase().includes(q) ||
      a.company?.toLowerCase().includes(q) ||
      a.plate?.toLowerCase().includes(q),
  );
  const overstayCount = active.filter((a) => a.overstayMinutes > 0).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        {/* Scan */}
        <Card>
          <CardContent className="space-y-3 pt-5">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                lookup(ref);
              }}
            >
              <div className="relative flex-1">
                <ScanLine className="absolute left-3 top-3 size-5 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  className="h-11 pl-10 text-base"
                  placeholder="สแกน QR บนสลิป หรือพิมพ์รหัสบัตร เช่น V-7K3Q9P"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <Button type="submit" size="lg" disabled={pending || !ref.trim()}>
                {pending ? <Loader2 className="animate-spin" /> : <Search />} ค้นหา
              </Button>
              <Button type="button" size="lg" variant="outline" onClick={() => setCamera((c) => !c)} aria-label="สแกนด้วยกล้อง">
                {camera ? <CameraOff /> : <Camera />}
              </Button>
            </form>
            {camera && <QrScanner onDecode={lookup} />}
            {error && (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Result */}
        {done ? (
          <Card className="border-green-600">
            <CardContent className="space-y-4 py-8 text-center">
              <CheckCircle2 className="mx-auto size-14 text-green-600" />
              <div>
                <p className="text-xl font-semibold">Check-out เรียบร้อย</p>
                <p className="text-muted-foreground">
                  {done.preview.visitorName} · {done.preview.passCode}
                </p>
              </div>
              <div className="mx-auto grid max-w-md grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground">อยู่ภายใน</p>
                  <p className="text-lg font-bold">{done.preview.durationText}</p>
                </div>
                <div className={cn("rounded-lg border p-3", done.preview.overstayMinutes > 0 && "border-destructive text-destructive")}>
                  <p className="text-muted-foreground">เกินเวลา</p>
                  <p className="text-lg font-bold">
                    {done.preview.overstayMinutes > 0 ? formatDuration(done.preview.overstayMinutes) : "ไม่เกิน"}
                  </p>
                </div>
                {done.netWeightKg != null && (
                  <div className="col-span-2 rounded-lg border p-3">
                    <p className="text-muted-foreground">น้ำหนักสุทธิ</p>
                    <p className="text-lg font-bold">{done.netWeightKg.toLocaleString()} กก.</p>
                  </div>
                )}
              </div>
              <p className="text-sm">กรุณารับคืนบัตรผู้ติดต่อ{done.preview.mode === "FACTORY" && " และอุปกรณ์ PPE"}</p>
              <Button size="lg" onClick={reset}>
                <ScanLine /> สแกนคนถัดไป
              </Button>
            </CardContent>
          </Card>
        ) : preview ? (
          <VisitPanel
            key={preview.visitId}
            preview={preview}
            onPreviewChange={setPreview}
            onCheckedOut={(r) => {
              setDone(r);
              setPreview(null);
              refreshActive();
            }}
          />
        ) : (
          <div className="rounded-xl border-2 border-dashed p-10 text-center text-muted-foreground">
            <ScanLine className="mx-auto mb-2 size-10" />
            สแกน QR Code บนสลิปของผู้ติดต่อ หรือเลือกจากรายชื่อด้านข้าง
          </div>
        )}
      </div>

      {/* Active visitors */}
      <Card className="h-fit lg:sticky lg:top-4">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle>
              <Users className="size-5" /> อยู่ในพื้นที่ ({active.length})
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={refreshActive} aria-label="รีเฟรช">
              <RefreshCw className={cn(pending && "animate-spin")} />
            </Button>
          </div>
          {overstayCount > 0 && (
            <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">⚠ อยู่เกินเวลา {overstayCount} คน</p>
          )}
          <Input placeholder="ค้นหาชื่อ / รหัสบัตร / ทะเบียน" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </CardHeader>
        <CardContent className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีผู้ติดต่อในพื้นที่</p>}
          {shown.map((a) => (
            <button
              key={a.visitId}
              type="button"
              onClick={() => lookup(a.passCode)}
              className={cn(
                "w-full rounded-md border p-2.5 text-left text-sm hover:bg-accent",
                a.overstayMinutes > 0 && "border-destructive/60 bg-destructive/5",
                preview?.visitId === a.visitId && "ring-2 ring-primary",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{a.visitorName}</span>
                <span className="font-mono text-xs">{a.passCode}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 truncate">
                  {a.mode === "FACTORY" ? <Factory className="size-3" /> : a.mode === "VILLAGE" ? <Home className="size-3" /> : <Building2 className="size-3" />}
                  เข้า {a.checkInText} · {a.durationText}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {a.stampStatus === "PENDING" && <Stamp className="size-3 text-amber-500" aria-label="รอ E-Stamp" />}
                  {a.overstayMinutes > 0 && <Badge className="bg-destructive px-1.5 text-white">เกิน {formatDuration(a.overstayMinutes)}</Badge>}
                </span>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
