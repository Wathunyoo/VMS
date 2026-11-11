"use client";

import { QRCodeSVG } from "qrcode.react";
import { Car, Clock, Home, UserRound } from "lucide-react";
import type { InviteView } from "@/application/guest-invite/guest-invite.types";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** หน้าที่แขกเปิดจากลิงก์ — แสดง QR ให้ รปภ. สแกน */
export function GuestPassCard({ view, qrValue }: { view: InviteView; qrValue: string }) {
  const usable = view.state === "OPEN" || view.state === "NOT_YET";
  return (
    <Card className="overflow-hidden">
      <div className={cn("px-5 py-3 text-center text-white", usable ? "bg-village" : "bg-muted-foreground")}>
        <p className="text-lg font-bold">{usable ? "แสดง QR นี้ที่ป้อม รปภ." : view.stateText}</p>
      </div>
      <CardContent className="space-y-4 p-5">
        {usable ? (
          <div className="mx-auto w-fit rounded-xl border bg-white p-3">
            <QRCodeSVG value={qrValue} size={240} marginSize={2} level="M" aria-label="QR สำหรับ รปภ." />
          </div>
        ) : (
          <p className="rounded-md bg-muted p-4 text-center text-sm text-muted-foreground">{view.problem}</p>
        )}
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <Home className="size-4 shrink-0 text-muted-foreground" /> <span className="font-medium">{view.placeText}</span>
          </p>
          <p className="flex items-center gap-2">
            <Clock className="size-4 shrink-0 text-muted-foreground" /> {view.windowText}
          </p>
          {view.plateNumber && (
            <p className="flex items-center gap-2">
              <Car className="size-4 shrink-0 text-muted-foreground" /> {view.plateNumber}
            </p>
          )}
          {view.guestName && (
            <p className="flex items-center gap-2">
              <UserRound className="size-4 shrink-0 text-muted-foreground" /> {view.guestName}
            </p>
          )}
        </div>
        {view.state === "NOT_YET" && <p className="text-center text-xs text-muted-foreground">เข้าได้ก่อนเวลาที่แจ้งไม่เกิน 1 ชั่วโมง</p>}
        {usable && <p className="text-center text-xs text-muted-foreground">รปภ. อาจขอดูบัตรประชาชน/ถ่ายรูปตามระเบียบของสถานที่</p>}
      </CardContent>
    </Card>
  );
}
