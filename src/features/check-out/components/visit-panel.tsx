"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Building2, Car, Clock, Factory, Home, KeyRound, Loader2, LogOut, ShieldAlert, Stamp, Truck, UserRound } from "lucide-react";
import type { CheckOutPreview } from "@/application/check-out/check-out.types";
import type { CheckOutResult } from "@/application/check-out/check-out.usecase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/domain/visit/stay";
import { cn } from "@/lib/utils";
import { approveStampManualAction, approveStampOtpAction, checkOutAction } from "../actions";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

interface Props {
  preview: CheckOutPreview;
  onPreviewChange: (p: CheckOutPreview) => void;
  onCheckedOut: (r: CheckOutResult) => void;
}

export function VisitPanel({ preview: p, onPreviewChange, onCheckedOut }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [weightOut, setWeightOut] = useState("");

  const isOut = p.status === "CHECKED_OUT";
  const overstay = p.overstayMinutes > 0;
  const stampPending = p.stamp?.status === "PENDING";
  const isFactory = p.mode === "FACTORY";
  const isVillage = p.mode === "VILLAGE";
  const weightOutNum = weightOut === "" ? undefined : Number(weightOut);
  const net =
    p.vehicle?.weightInKg != null && weightOutNum != null && Number.isFinite(weightOutNum)
      ? Math.abs(p.vehicle.weightInKg - weightOutNum)
      : null;

  const act = <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, onOk: (d: T) => void) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) onOk(r.data);
      else setError(r.error);
    });
  };

  return (
    <Card className={cn("overflow-hidden", overstay && !isOut && "border-destructive")}>
      {/* Header */}
      <div className={cn("flex gap-4 p-5", isFactory ? "bg-factory/10" : isVillage ? "bg-village/10" : "bg-office/10")}>
        {p.facePhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.facePhotoUrl} alt="" className="h-28 w-22 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex h-28 w-22 shrink-0 items-center justify-center rounded-md bg-muted">
            <UserRound className="size-8 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg font-bold">{p.passCode}</span>
            <Badge variant="outline" className="gap-1">
              {isFactory ? <Factory className="size-3" /> : isVillage ? <Home className="size-3" /> : <Building2 className="size-3" />} {p.siteName}
            </Badge>
            {isOut ? (
              <Badge variant="secondary">ออกแล้ว</Badge>
            ) : overstay ? (
              <Badge className="bg-destructive text-white">เกินเวลา {formatDuration(p.overstayMinutes)}</Badge>
            ) : (
              <Badge className="bg-green-600 text-white">อยู่ในพื้นที่</Badge>
            )}
          </div>
          <p className="text-xl font-semibold">{p.visitorName}</p>
          {p.company && <p className="text-sm text-muted-foreground">{p.company}</p>}
          <p className="font-mono text-xs text-muted-foreground">
            {p.idLabel} {p.idNumberMasked}
          </p>
        </div>
      </div>

      <CardContent className="space-y-5 pt-5">
        {/* Time */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">เวลาเข้า</p>
            <p className="font-medium">{p.checkInText}</p>
          </div>
          <div className={cn("rounded-lg border p-3", overstay && "border-destructive bg-destructive/5")}>
            <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" /> อยู่ภายใน
            </p>
            <p className={cn("text-lg font-bold", overstay && "text-destructive")}>{p.durationText}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{isOut ? "เวลาออก" : "ใช้ได้ถึง"}</p>
            <p className="font-medium">{p.checkOutText ?? p.expectedText}</p>
          </div>
        </div>

        {overstay && !isOut && (
          <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            อยู่เกินเวลาที่อนุญาต {formatDuration(p.overstayMinutes)} — กรุณาสอบถามเหตุผลและบันทึกในรายงาน
          </p>
        )}

        <div className="divide-y">
          <Row label="ติดต่อ">{p.visiting}</Row>
          {p.hostName && <Row label={isVillage ? "ลูกบ้าน" : "ผู้รับพบ"}>{p.hostName}</Row>}
          <Row label="วัตถุประสงค์">{p.purposeLabel}</Row>
          {p.idCardPhotoUrl && (
            <Row label="ภาพบัตร">
              <a href={p.idCardPhotoUrl} target="_blank" rel="noreferrer" className="underline">
                เปิดดูภาพบัตร
              </a>
            </Row>
          )}
        </div>

        {/* E-Stamp */}
        {p.stamp && (
          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-medium">
                <Stamp className="size-4" /> E-Stamp
              </h3>
              <Badge
                className={cn(
                  p.stamp.status === "APPROVED" && "bg-green-600 text-white",
                  p.stamp.status === "PENDING" && "bg-amber-500 text-white",
                  p.stamp.status === "REJECTED" && "bg-destructive text-white",
                )}
              >
                {p.stamp.label}
                {p.stamp.stampedText && ` · ${p.stamp.stampedText}`}
              </Badge>
            </div>

            {stampPending && !isOut && (
              <>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(() => approveStampOtpAction(p.visitId, otp), (np) => {
                      setOtp("");
                      onPreviewChange(np);
                    });
                  }}
                >
                  <div className="relative flex-1">
                    <KeyRound className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                    <Input
                      className="pl-8 font-mono tracking-[0.4em]"
                      placeholder={`OTP 6 หลักจาก${isVillage ? "ลูกบ้าน" : " Host"}`}
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      disabled={p.stamp.otpLocked || p.stamp.otpExpired}
                    />
                  </div>
                  <Button type="submit" disabled={pending || otp.length !== 6 || p.stamp.otpLocked}>
                    ยืนยัน OTP
                  </Button>
                </form>
                {(p.stamp.otpLocked || p.stamp.otpExpired) && (
                  <p className="text-xs text-destructive">
                    {p.stamp.otpLocked ? "OTP ถูกล็อกเพราะกรอกผิดหลายครั้ง" : "OTP หมดอายุแล้ว"} — ใช้การประทับแทนด้านล่าง
                  </p>
                )}

                {manualOpen ? (
                  <div className="flex gap-2">
                    <Input placeholder={`เหตุผล เช่น ${isVillage ? "ลูกบ้าน" : "Host"} โทรยืนยันแล้ว`} value={reason} onChange={(e) => setReason(e.target.value)} />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending || reason.trim().length < 3}
                      onClick={() => act(() => approveStampManualAction(p.visitId, reason), onPreviewChange)}
                    >
                      ประทับแทน
                    </Button>
                  </div>
                ) : (
                  <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setManualOpen(true)}>
                    {isVillage ? "ลูกบ้านยืนยันด้วยวิธีอื่น (ประทับแทน)" : "Host อนุมัติด้วยวิธีอื่น (ประทับแทน)"}
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {/* Vehicle */}
        {p.vehicle && (
          <section className="space-y-2 rounded-lg border p-4">
            <h3 className="flex items-center gap-2 font-medium">
              {isFactory ? <Truck className="size-4" /> : <Car className="size-4" />} ยานพาหนะ
            </h3>
            <div className="divide-y">
              <Row label="ทะเบียน">{p.vehicle.plate}</Row>
              <Row label="ประเภท">{p.vehicle.typeLabel}</Row>
              {p.vehicle.bay && <Row label="Loading Bay">{p.vehicle.bay}</Row>}
              {p.vehicle.weightInKg != null && <Row label="น้ำหนักชั่งเข้า">{p.vehicle.weightInKg.toLocaleString()} กก.</Row>}
              {isOut && p.vehicle.weightOutKg != null && (
                <Row label="น้ำหนักชั่งออก">{p.vehicle.weightOutKg.toLocaleString()} กก.</Row>
              )}
            </div>
            {isFactory && !isOut && (
              <div className="flex items-center gap-2 pt-1">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="น้ำหนักชั่งออก (กก.)"
                  value={weightOut}
                  onChange={(e) => setWeightOut(e.target.value)}
                />
                {net != null && <span className="shrink-0 text-sm">สุทธิ <b>{net.toLocaleString()}</b> กก.</span>}
              </div>
            )}
          </section>
        )}


        {/* Safety */}
        {p.safety && p.safety.highRisk.length > 0 && (
          <section className="rounded-lg border border-factory/50 bg-factory/5 p-4 text-sm">
            <h3 className="mb-1 flex items-center gap-2 font-medium">
              <ShieldAlert className="size-4" /> งานเสี่ยง · Permit {p.safety.workPermitId}
            </h3>
            <p className="text-muted-foreground">{p.safety.highRisk.join(", ")}</p>
            {!isOut && <p className="mt-1 text-xs">กรุณาตรวจปิดใบอนุญาตทำงาน และรับคืน PPE ก่อนออกจากพื้นที่</p>}
          </section>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {!isOut && (
          <div className="space-y-2">
            {stampPending && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="size-3.5" /> ยังไม่ได้รับ E-Stamp จาก{isVillage ? "ลูกบ้าน" : " Host"} — check-out ได้ และระบบจะบันทึกว่าไม่ได้รับการยืนยัน
              </p>
            )}
            <Button
              size="lg"
              className="w-full"
              disabled={pending}
              onClick={() => act(() => checkOutAction(p.visitId, weightOutNum), onCheckedOut)}
            >
              {pending ? <Loader2 className="animate-spin" /> : <LogOut />} ยืนยัน Check-out &amp; รับคืนบัตร
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
