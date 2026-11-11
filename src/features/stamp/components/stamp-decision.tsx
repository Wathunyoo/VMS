"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Clock, Loader2, LogOut, UserRound, XCircle } from "lucide-react";
import type { StampRequestView } from "@/application/stamp/stamp.usecase";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { decideStampAction } from "../actions";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function StampDecision({ token, initial }: { token: string; initial: StampRequestView }) {
  const [view, setView] = useState(initial);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const decide = (decision: "APPROVE" | "REJECT") => {
    setError(null);
    startTransition(async () => {
      const r = await decideStampAction(token, decision, decision === "REJECT" ? reason : undefined);
      if (r.ok) setView(r.data);
      else setError(r.error);
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-4 bg-office/10 p-5">
        {view.facePhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={view.facePhotoUrl} alt="" className="h-24 w-18 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex h-24 w-18 shrink-0 items-center justify-center rounded-md bg-muted">
            <UserRound className="size-7 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">ผู้ติดต่อที่มาพบคุณ</p>
          <p className="text-xl font-semibold">{view.visitorName}</p>
          {view.company && <p className="text-sm text-muted-foreground">{view.company}</p>}
        </div>
      </div>

      <CardContent className="space-y-5 pt-4">
        <div className="divide-y">
          <Row label="วัตถุประสงค์">{view.purposeLabel}</Row>
          <Row label="ติดต่อ">{view.visiting}</Row>
          <Row label="เวลาเข้า">{view.checkInText}</Row>
          <Row label={view.idLabel}>
            <span className="font-mono">{view.idNumberMasked}</span>
          </Row>
          {view.plate && <Row label="ทะเบียนรถ">{view.plate}</Row>}
        </div>

        {view.stampStatus === "APPROVED" ? (
          <div className="space-y-1 rounded-lg bg-green-50 p-4 text-center text-green-800">
            <CheckCircle2 className="mx-auto size-10" />
            <p className="font-semibold">อนุมัติแล้ว</p>
            {view.stampedText && <p className="text-xs">{view.stampedText}</p>}
          </div>
        ) : view.stampStatus === "REJECTED" ? (
          <div className="space-y-1 rounded-lg bg-destructive/10 p-4 text-center text-destructive">
            <XCircle className="mx-auto size-10" />
            <p className="font-semibold">ไม่อนุมัติ</p>
            {view.stampedText && <p className="text-xs">{view.stampedText}</p>}
          </div>
        ) : view.visitStatus !== "CHECKED_IN" ? (
          <div className="space-y-1 rounded-lg bg-muted p-4 text-center text-muted-foreground">
            <LogOut className="mx-auto size-8" />
            <p>ผู้ติดต่อออกจากอาคารไปแล้ว</p>
          </div>
        ) : view.expired ? (
          <div className="space-y-1 rounded-lg bg-muted p-4 text-center text-muted-foreground">
            <Clock className="mx-auto size-8" />
            <p>ลิงก์นี้หมดอายุแล้ว กรุณาติดต่อเคาน์เตอร์ต้อนรับ</p>
          </div>
        ) : rejecting ? (
          <div className="space-y-3">
            <Textarea
              placeholder="เหตุผล (ไม่บังคับ) เช่น ไม่ได้นัดหมายไว้"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              rows={3}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" disabled={pending} onClick={() => setRejecting(false)}>
                ย้อนกลับ
              </Button>
              <Button variant="destructive" size="lg" disabled={pending} onClick={() => decide("REJECT")}>
                {pending ? <Loader2 className="animate-spin" /> : <XCircle />} ยืนยันไม่อนุมัติ
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Button size="lg" className="h-14 w-full bg-green-600 text-base hover:bg-green-700" disabled={pending} onClick={() => decide("APPROVE")}>
              {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} อนุมัติ (ประทับตรา)
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" disabled={pending} onClick={() => setRejecting(true)}>
              ไม่อนุมัติ
            </Button>
            <p className="text-center text-xs text-muted-foreground">การอนุมัติเป็นการยืนยันว่าผู้ติดต่อมาพบคุณจริง</p>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
