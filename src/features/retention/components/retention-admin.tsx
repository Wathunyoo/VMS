"use client";

import { useState, useTransition } from "react";
import { Clock, Eraser, ImageOff, Loader2, Save, ShieldCheck, Trash2, UserX } from "lucide-react";
import type { PurgeCounts } from "@/application/retention/retention.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { runPurgeNowAction, savePolicyAction, type RetentionOverview } from "../actions";

const total = (c: PurgeCounts) => c.photosDeleted + c.visitorsAnonymized + c.vehiclesAnonymized + c.visitsCleaned;

function Stat({ icon: Icon, label, value }: { icon: typeof ImageOff; label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}

export function RetentionAdmin({ initial }: { initial: RetentionOverview }) {
  const [data, setData] = useState(initial);
  const [form, setForm] = useState({
    photoDays: String(initial.policy.photoDays),
    personalDataDays: String(initial.policy.personalDataDays),
    autoEnabled: initial.policy.autoEnabled,
  });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    form.photoDays !== String(data.policy.photoDays) ||
    form.personalDataDays !== String(data.policy.personalDataDays) ||
    form.autoEnabled !== data.policy.autoEnabled;

  const save = () =>
    startTransition(async () => {
      const r = await savePolicyAction({
        photoDays: Number(form.photoDays),
        personalDataDays: Number(form.personalDataDays),
        autoEnabled: form.autoEnabled,
      });
      if (r.ok) {
        setData(r.data);
        setMessage({ ok: true, text: "บันทึกนโยบายแล้ว" });
      } else setMessage({ ok: false, text: r.error });
    });

  const runNow = () => {
    if (!confirm(`ยืนยันลบข้อมูล ${total(data.preview).toLocaleString()} รายการตามนโยบาย? ข้อมูลที่ลบแล้วกู้คืนไม่ได้`)) return;
    startTransition(async () => {
      const r = await runPurgeNowAction();
      if (r.ok) {
        setData(r.data.overview);
        setMessage({ ok: true, text: `ลบเรียบร้อย ${total(r.data.result).toLocaleString()} รายการ` });
      } else setMessage({ ok: false, text: r.error });
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>
            <Clock className="size-5" /> ระยะเวลาเก็บข้อมูล
          </CardTitle>
          <CardDescription>
            นับจากวันที่ผู้ติดต่อออกจากพื้นที่ · ไม่ลบคนที่ยังอยู่ในพื้นที่และคนในรายชื่อห้ามเข้า · สถิติการเข้า-ออกยังเก็บไว้
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="photoDays">ลบรูปใบหน้า / ป้ายทะเบียน หลัง (วัน)</Label>
              <Input
                id="photoDays"
                type="number"
                min={7}
                max={3650}
                value={form.photoDays}
                onChange={(e) => setForm({ ...form, photoDays: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="personalDataDays">ลบชื่อ เบอร์โทร เลขบัตร ทะเบียนรถ หลัง (วัน)</Label>
              <Input
                id="personalDataDays"
                type="number"
                min={30}
                max={3650}
                value={form.personalDataDays}
                onChange={(e) => setForm({ ...form, personalDataDays: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">นับจากการมาครั้งล่าสุดของผู้ติดต่อคนนั้น</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="autoEnabled" checked={form.autoEnabled} onCheckedChange={(v) => setForm({ ...form, autoEnabled: v })} />
            <Label htmlFor="autoEnabled">ลบอัตโนมัติทุก 6 ชั่วโมง</Label>
          </div>
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} บันทึกนโยบาย
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Eraser className="size-5" /> ถ้ารันตอนนี้จะลบ
          </CardTitle>
          <CardDescription>ตามนโยบายที่บันทึกไว้</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat icon={ImageOff} label="รูปถ่าย" value={data.preview.photosDeleted} />
            <Stat icon={UserX} label="ผู้ติดต่อ" value={data.preview.visitorsAnonymized} />
            <Stat icon={Trash2} label="ทะเบียนรถ" value={data.preview.vehiclesAnonymized} />
            <Stat icon={Eraser} label="หมายเหตุการเข้าพบ" value={data.preview.visitsCleaned} />
          </div>
          <Button variant="destructive" onClick={runNow} disabled={pending || total(data.preview) === 0}>
            {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} ลบตอนนี้
          </Button>
        </CardContent>
      </Card>

      {message && (
        <p
          role="alert"
          className={
            message.ok
              ? "rounded-md bg-green-50 px-4 py-2 text-sm text-green-800"
              : "rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          }
        >
          {message.text}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <ShieldCheck className="size-5" /> ประวัติการลบข้อมูล
          </CardTitle>
          <CardDescription>หลักฐานการปฏิบัติตามนโยบายระยะเวลาเก็บข้อมูล (PDPA) · แสดงเฉพาะรอบที่มีการลบหรือผิดพลาด</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(() => {
            const rows = data.runs.filter((r) => r.error || total(r) > 0 || r.trigger === "MANUAL");
            if (rows.length === 0) return <p className="py-4 text-center text-sm text-muted-foreground">ยังไม่มีการลบข้อมูล</p>;
            return (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">เวลา</th>
                    <th className="py-2 pr-3">โดย</th>
                    <th className="py-2 pr-3 text-right">รูป</th>
                    <th className="py-2 pr-3 text-right">ผู้ติดต่อ</th>
                    <th className="py-2 pr-3 text-right">ทะเบียนรถ</th>
                    <th className="py-2 pr-3 text-right">หมายเหตุ</th>
                    <th className="py-2">นโยบาย</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{r.ranAtText}</td>
                      <td className="py-2 pr-3">
                        {r.trigger === "AUTO" ? <Badge variant="secondary">อัตโนมัติ</Badge> : r.actor}
                        {r.error && <Badge className="ml-1 bg-destructive text-white">ผิดพลาด</Badge>}
                      </td>
                      <td className="py-2 pr-3 text-right">{r.photosDeleted}</td>
                      <td className="py-2 pr-3 text-right">{r.visitorsAnonymized}</td>
                      <td className="py-2 pr-3 text-right">{r.vehiclesAnonymized}</td>
                      <td className="py-2 pr-3 text-right">{r.visitsCleaned}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {r.photoDays} / {r.personalDataDays} วัน
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
