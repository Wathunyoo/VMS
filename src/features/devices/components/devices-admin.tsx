"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, MapPin, MonitorCheck, MonitorSmartphone, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createStaffAction } from "@/features/admin-users/actions";
import { createPointAction, revokeDeviceAction, bindThisDeviceAction } from "../actions";

export interface PointView {
  id: string;
  name: string;
  createdText: string;
  createdBy: string;
  lastSeenText: string | null;
  hasDevice: boolean;
  isThis: boolean;
  staff: { id: string; username: string; fullName: string; isActive: boolean }[];
}

interface Props {
  points: PointView[];
  limit: number;
}

type Result = { ok: true } | { ok: false; error: string };

export function DevicesAdmin({ points, limit }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ username: string; password: string; point: string } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState({ username: "", fullName: "" });
  const [pending, start] = useTransition();
  const full = points.length >= limit;
  const thisPoint = points.find((p) => p.isThis);

  const act = (fn: () => Promise<Result>, done?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        done?.();
        router.refresh();
      }
    });
  };

  const addStaff = (p: PointView) => {
    setError(null);
    start(async () => {
      const r = await createStaffAction({ ...staffForm, role: "STAFF", checkInPointId: p.id });
      if (!r.ok) return setError(r.error);
      setIssued({ username: r.data.user.username, password: r.data.tempPassword, point: p.name });
      setStaffForm({ username: "", fullName: "" });
      setAdding(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {issued && (
        <Card className="border-amber-400 bg-amber-50">
          <CardContent className="space-y-2 pt-5 text-sm">
            <p className="font-medium">
              เพิ่มเจ้าหน้าที่ “{issued.username}” ประจำจุด {issued.point} แล้ว — รหัสผ่านชั่วคราว (แสดงครั้งเดียว)
            </p>
            <div className="flex items-center gap-2">
              <code className="rounded bg-white px-3 py-1.5 font-mono text-lg tracking-wider">{issued.password}</code>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(issued.password)}>
                <Copy /> คัดลอก
              </Button>
            </div>
            <p className="text-xs text-amber-800">
              ส่งให้เจ้าหน้าที่ด้วยตนเอง · เข้าระบบที่เครื่องของจุดนี้ เครื่องนั้นจะเป็นจุด {issued.point} อัตโนมัติ · ระบบบังคับเปลี่ยนรหัสครั้งแรก
            </p>
            <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
              ปิด
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <Plus className="size-5" /> เพิ่มจุด Check-in
          </CardTitle>
          <CardDescription>
            สร้างจุดแล้วเพิ่มเจ้าหน้าที่ประจำจุด — เจ้าหน้าที่เข้าระบบที่เครื่องไหน เครื่องนั้นเป็นจุดนี้ทันที ไม่ต้องไปตั้งที่เครื่องเอง
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              act(() => createPointAction(name), () => setName(""));
            }}
          >
            <div className="min-w-60 flex-1 space-y-1.5">
              <Label htmlFor="pname">ชื่อจุด</Label>
              <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ป้อม รปภ. ประตู 1" maxLength={60} />
            </div>
            <Button type="submit" disabled={pending || full || name.trim().length < 2}>
              {pending ? <Loader2 className="animate-spin" /> : <Plus />} เพิ่มจุด
            </Button>
          </form>
          {full && <p className="text-sm text-amber-800">ใช้ครบ {limit} จุดตามสัญญาแล้ว — ยกเลิกจุดที่ไม่ใช้ หรือติดต่อผู้ให้บริการเพื่อเพิ่มจำนวนจุด</p>}
          <p className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm", thisPoint ? "bg-green-50 text-green-800" : "bg-muted text-muted-foreground")}>
            <MonitorSmartphone className="size-4 shrink-0" />
            {thisPoint ? `เครื่องที่เปิดหน้านี้อยู่ คือจุด “${thisPoint.name}”` : "เครื่องที่เปิดหน้านี้อยู่ ยังไม่ได้เป็นจุด Check-in"}
          </p>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">
          จุด Check-in {points.length} / {limit} จุด
        </h2>
        {points.length === 0 && <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">ยังไม่มีจุด Check-in</p>}
        {points.map((p) => (
          <Card key={p.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <MapPin className="size-4 text-muted-foreground" /> {p.name}
                    {p.isThis && <Badge variant="secondary">เครื่องนี้</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.hasDevice ? (
                      <span className="inline-flex items-center gap-1 text-green-700">
                        <MonitorCheck className="size-3.5" /> มีเครื่องแล้ว · ใช้ล่าสุด {p.lastSeenText ?? "—"}
                      </span>
                    ) : (
                      "ยังไม่มีเครื่อง — ให้เจ้าหน้าที่ประจำจุดเข้าระบบที่เครื่องของจุดนี้"
                    )}
                    {" · "}สร้าง {p.createdText} โดย {p.createdBy}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {!p.isThis && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        (!p.hasDevice || confirm(`ใช้เครื่องนี้เป็นจุด "${p.name}"? เครื่องเดิมของจุดนี้จะใช้ไม่ได้จนกว่าจะเข้าระบบใหม่`)) &&
                        act(() => bindThisDeviceAction(p.id))
                      }
                    >
                      <MonitorSmartphone /> ใช้เครื่องนี้
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      confirm(`ยกเลิกจุด "${p.name}"? เครื่องของจุดนี้จะ Check-in/out ไม่ได้อีก และเจ้าหน้าที่จะไม่ผูกกับจุดนี้แล้ว`) &&
                      act(() => revokeDeviceAction(p.id))
                    }
                  >
                    <Trash2 /> ยกเลิกจุด
                  </Button>
                </div>
              </div>

              <div className="space-y-2 rounded-md bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground">เจ้าหน้าที่ประจำจุด ({p.staff.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.staff.map((s) => (
                    <span key={s.id} className={cn("rounded-full border bg-background px-2.5 py-0.5 text-sm", !s.isActive && "text-muted-foreground line-through")}>
                      <span className="font-mono">{s.username}</span> · {s.fullName}
                    </span>
                  ))}
                  {adding !== p.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => {
                        setAdding(p.id);
                        setStaffForm({ username: "", fullName: "" });
                      }}
                    >
                      <UserPlus /> เพิ่มเจ้าหน้าที่
                    </Button>
                  )}
                </div>
                {adding === p.id && (
                  <form
                    className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto_auto] sm:items-end"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addStaff(p);
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor={`u-${p.id}`}>ชื่อผู้ใช้</Label>
                      <Input
                        id={`u-${p.id}`}
                        placeholder="เช่น gate1"
                        autoCapitalize="none"
                        value={staffForm.username}
                        onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`f-${p.id}`}>ชื่อ-นามสกุล</Label>
                      <Input id={`f-${p.id}`} value={staffForm.fullName} onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })} />
                    </div>
                    <Button type="submit" disabled={pending || !staffForm.username || !staffForm.fullName}>
                      {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} สร้างบัญชี
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="ยกเลิก" onClick={() => setAdding(null)}>
                      <X />
                    </Button>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
