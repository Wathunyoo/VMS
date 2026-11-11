"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Car, ChevronDown, ChevronUp, Loader2, Plus, QrCode, UserRound, X } from "lucide-react";
import type { ResidentInviteView, ResidentPageView } from "@/application/guest-invite/guest-invite.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { cancelInviteAction, createInviteAction } from "../actions";
import { InviteQr } from "./invite-qr";

const STATE_TONE: Record<ResidentInviteView["state"], string> = {
  OPEN: "bg-emerald-100 text-emerald-800",
  NOT_YET: "bg-sky-100 text-sky-800",
  EXPIRED: "bg-muted text-muted-foreground",
  USED: "bg-violet-100 text-violet-800",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

function FieldBox({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ResidentInvites({ token, initial }: { token: string; initial: ResidentPageView }) {
  const [invites, setInvites] = useState(initial.invites);
  const [created, setCreated] = useState<ResidentInviteView | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ guestName: "", plateNumber: "", note: "", ...initial.defaults });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrors({});
    startTransition(async () => {
      const r = await createInviteAction(token, form);
      if (!r.ok) {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
        return;
      }
      setCreated(r.invite);
      setInvites((xs) => [...xs, r.invite].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setForm((f) => ({ ...f, guestName: "", plateNumber: "", note: "" }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const cancel = (id: string) => {
    if (!confirm("ยกเลิก QR นี้? แขกจะใช้ QR นี้เข้าไม่ได้")) return;
    startTransition(async () => {
      const r = await cancelInviteAction(token, id);
      if (r.ok) {
        setInvites(r.data);
        if (created?.id === id) setCreated(null);
      } else setError(r.error);
    });
  };

  const upcoming = invites.filter((i) => i.state === "OPEN" || i.state === "NOT_YET");
  const past = invites.filter((i) => i.state !== "OPEN" && i.state !== "NOT_YET");

  return (
    <div className="space-y-4">
      {created && (
        <Card className="border-emerald-300">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-emerald-700">
                <QrCode className="size-5" /> สร้าง QR แล้ว — ส่งให้แขกได้เลย
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {created.windowText}
                {created.plateNumber && ` · ${created.plateNumber}`}
              </p>
            </div>
            <Button type="button" size="icon" variant="ghost" aria-label="ปิด" onClick={() => setCreated(null)}>
              <X />
            </Button>
          </CardHeader>
          <CardContent>
            <InviteQr invite={created} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <Plus className="size-5" /> แจ้งแขกใหม่
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3" noValidate>
            <div className="grid gap-3 min-[420px]:grid-cols-2">
              <FieldBox id="validFrom" label="มาตั้งแต่" error={errors.validFrom}>
                <Input id="validFrom" type="datetime-local" value={form.validFrom} onChange={set("validFrom")} required />
              </FieldBox>
              <FieldBox id="validUntil" label="ถึง" error={errors.validUntil}>
                <Input id="validUntil" type="datetime-local" value={form.validUntil} min={form.validFrom} onChange={set("validUntil")} required />
              </FieldBox>
            </div>
            <FieldBox id="plateNumber" label="ทะเบียนรถ (ถ้ามี)" error={errors.plateNumber} hint="เช่น 1กข 1234 กรุงเทพมหานคร">
              <Input id="plateNumber" value={form.plateNumber} onChange={set("plateNumber")} maxLength={30} autoComplete="off" />
            </FieldBox>
            <FieldBox id="guestName" label="ชื่อแขก (ถ้ามี)" error={errors.guestName}>
              <Input id="guestName" value={form.guestName} onChange={set("guestName")} maxLength={120} autoComplete="off" />
            </FieldBox>
            <FieldBox id="note" label="หมายเหตุถึง รปภ. (ถ้ามี)" error={errors.note}>
              <Input id="note" value={form.note} onChange={set("note")} maxLength={200} placeholder="เช่น มา 3 คน / ช่างแอร์" />
            </FieldBox>
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <QrCode />} สร้าง QR สำหรับแขก
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarClock className="size-5" /> แขกที่แจ้งไว้ ({upcoming.length})
        </h2>
        {upcoming.length === 0 && <p className="rounded-lg border p-4 text-center text-sm text-muted-foreground">ยังไม่มีรายการ</p>}
        {[...upcoming, ...past].map((i) => {
          const open = openId === i.id;
          const live = i.state === "OPEN" || i.state === "NOT_YET";
          return (
            <Card key={i.id} className={cn(!live && "opacity-70")}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5 text-sm">
                    <p className="font-medium">{i.windowText}</p>
                    <p className="flex flex-wrap gap-x-3 text-muted-foreground">
                      {i.guestName && (
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="size-3.5" /> {i.guestName}
                        </span>
                      )}
                      {i.plateNumber && (
                        <span className="inline-flex items-center gap-1">
                          <Car className="size-3.5" /> {i.plateNumber}
                        </span>
                      )}
                    </p>
                    {i.note && <p className="text-xs text-muted-foreground">{i.note}</p>}
                  </div>
                  <Badge className={cn("shrink-0 border-transparent", STATE_TONE[i.state])}>{i.stateText}</Badge>
                </div>
                {live && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setOpenId(open ? null : i.id)}>
                      {open ? <ChevronUp /> : <ChevronDown />} {open ? "ซ่อน QR" : "แสดง QR / ส่งอีกครั้ง"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => cancel(i.id)}>
                      ยกเลิก
                    </Button>
                  </div>
                )}
                {live && open && <InviteQr invite={i} />}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
