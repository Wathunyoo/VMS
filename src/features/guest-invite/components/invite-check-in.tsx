"use client";

import { useState, useTransition } from "react";
import { CalendarCheck, Camera, CameraOff, Car, Loader2, QrCode, RefreshCw, Search, UserRound, X } from "lucide-react";
import type { InviteView } from "@/application/guest-invite/guest-invite.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QrScanner } from "@/features/check-out/components/qr-scanner";
import { cn } from "@/lib/utils";
import { listTodayInvitesAction, lookupInviteAction } from "../actions";

/**
 * จุด รปภ.: สแกน QR ของแขกที่ลูกบ้านแจ้งล่วงหน้า หรือเลือกจากรายชื่อวันนี้
 * → กรอกบ้าน/ลูกบ้าน/ทะเบียนรถให้อัตโนมัติ
 */
export function InviteCheckIn({ initial, onApply, autoScan = false }: { initial: InviteView[]; onApply: (v: InviteView) => void; autoScan?: boolean }) {
  const [list, setList] = useState(initial);
  const [camera, setCamera] = useState(autoScan);
  const [code, setCode] = useState("");
  const [q, setQ] = useState("");
  const [showList, setShowList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apply = (r: { ok: true; data: InviteView } | { ok: false; error: string }) => {
    if (!r.ok) return setError(r.error);
    if (r.data.problem) return setError(`${r.data.placeText}: ${r.data.problem}`);
    setError(null);
    setCamera(false);
    setShowList(false);
    setCode("");
    onApply(r.data);
  };

  const lookup = (ref: { scanned?: string; id?: string }) => startTransition(async () => apply(await lookupInviteAction(ref)));

  const refresh = () =>
    startTransition(async () => {
      const r = await listTodayInvitesAction();
      if (r.ok) setList(r.data);
    });

  const needle = q.trim().toLowerCase();
  const shown = list.filter(
    (i) => !needle || [i.placeText, i.hostName, i.guestName, i.plateNumber, i.note].some((s) => s?.toLowerCase().replace(/\s/g, "").includes(needle.replace(/\s/g, ""))),
  );

  return (
    <Card className="border-village/50">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle>
          <QrCode className="size-5 text-village" /> แขกที่ลูกบ้านแจ้งล่วงหน้า
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={camera ? "secondary" : "default"} onClick={() => setCamera((c) => !c)} disabled={pending}>
            {camera ? <CameraOff /> : <Camera />} {camera ? "ปิดกล้อง" : "สแกน QR แขก"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowList((s) => !s)}>
            <CalendarCheck /> รายชื่อวันนี้ ({list.length})
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {camera && <QrScanner onDecode={(text) => lookup({ scanned: text })} />}
        {/* เครื่องสแกนบาร์โค้ดแบบ USB พิมพ์ค่าแล้วกด Enter */}
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (code.trim()) lookup({ scanned: code });
              }
            }}
            placeholder="หรือใช้เครื่องสแกน QR (USB) ที่ช่องนี้"
            aria-label="ค่าจาก QR ของแขก"
            autoComplete="off"
          />
          <Button type="button" variant="outline" disabled={pending || !code.trim()} onClick={() => lookup({ scanned: code })}>
            {pending ? <Loader2 className="animate-spin" /> : "ตรวจ"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="flex items-start justify-between gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
            <button type="button" aria-label="ปิด" onClick={() => setError(null)}>
              <X className="size-4" />
            </button>
          </p>
        )}

        {showList && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา บ้านเลขที่ / ทะเบียนรถ / ชื่อ" />
              </div>
              <Button type="button" size="icon" variant="ghost" aria-label="โหลดใหม่" onClick={refresh} disabled={pending}>
                <RefreshCw className={cn(pending && "animate-spin")} />
              </Button>
            </div>
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {shown.length === 0 && <p className="py-3 text-center text-sm text-muted-foreground">ไม่มีแขกที่แจ้งไว้สำหรับวันนี้</p>}
              {shown.map((i) => (
                <button
                  type="button"
                  key={i.id}
                  onClick={() => lookup({ id: i.id })}
                  className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {i.placeText} <span className="font-normal text-muted-foreground">· คุณ{i.hostName}</span>
                    </span>
                    <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>{i.windowText}</span>
                      {i.plateNumber && (
                        <span className="inline-flex items-center gap-1">
                          <Car className="size-3" /> {i.plateNumber}
                        </span>
                      )}
                      {i.guestName && (
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="size-3" /> {i.guestName}
                        </span>
                      )}
                    </span>
                  </span>
                  <Badge variant={i.state === "OPEN" ? "default" : "secondary"} className="shrink-0">
                    {i.stateText}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
