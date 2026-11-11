"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Copy, Link2, Link2Off, MessageCircle, Search, Send, XCircle } from "lucide-react";
import type { HostLineView } from "@/application/host-line/host-line.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createLinkCodeAction, listHostLineAction, sendTestAction, unlinkHostAction } from "../actions";

interface Config {
  canSend: boolean;
  canReceive: boolean;
  basicId: string | null;
  addFriendUrl: string | null;
  webhookUrl: string;
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="size-4 text-green-600" /> : <XCircle className="size-4 text-destructive" />} {label}
    </li>
  );
}

export function HostLineAdmin({ initialHosts, config }: { initialHosts: HostLineView[]; config: Config }) {
  const [hosts, setHosts] = useState(initialHosts);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (fn: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>, okText: string) => {
    setMessage(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setMessage({ ok: true, text: okText });
      const list = await listHostLineAction();
      if (list.ok) setHosts(list.data);
    });
  };

  const q = query.trim().toLowerCase();
  const shown = hosts.filter(
    (h) => !q || [h.fullName, h.department, h.tenantName].some((v) => v?.toLowerCase().includes(q)),
  );
  const linkedCount = hosts.filter((h) => h.linked).length;
  const ready = config.canSend && config.canReceive;

  return (
    <div className="space-y-5">
      <Card className={ready ? "" : "border-amber-400"}>
        <CardHeader>
          <CardTitle>
            <MessageCircle className="size-5 text-green-600" /> สถานะ LINE Official Account
          </CardTitle>
          <CardDescription>ใช้ LINE Messaging API (LINE Notify ปิดบริการแล้ว)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="space-y-1">
            <Check ok={config.canSend} label="LINE_CHANNEL_ACCESS_TOKEN (ส่งข้อความ)" />
            <Check ok={config.canReceive} label="LINE_CHANNEL_SECRET (รับรหัสเชื่อมต่อผ่าน webhook)" />
            <Check ok={!!config.basicId} label={`LINE_OA_BASIC_ID ${config.basicId ? `(${config.basicId})` : "(ลิงก์เพิ่มเพื่อน)"}`} />
          </ul>
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs text-muted-foreground">Webhook URL สำหรับตั้งค่าใน LINE Developers Console (ต้องเป็น HTTPS ที่อินเทอร์เน็ตเข้าถึงได้)</p>
            <code className="break-all text-xs">{config.webhookUrl}</code>
          </div>
          {!ready && <p className="text-amber-700">ระหว่างที่ยังไม่ได้ตั้งค่า ระบบจะแสดงลิงก์อนุมัติ/OTP ใน log ของเซิร์ฟเวอร์แทน</p>}
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
        <CardHeader className="space-y-3">
          <CardTitle>
            Host ที่เชื่อมต่อ LINE แล้ว {linkedCount} / {hosts.length}
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="ค้นหาชื่อ / แผนก / บริษัท / บ้านเลขที่" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {shown.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {h.fullName}
                  {h.department && <span className="ml-1 text-sm text-muted-foreground">({h.department})</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {h.placeText}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {h.linked ? (
                  <>
                    <Badge className="bg-green-600 text-white">
                      LINE: {h.lineDisplayName ?? "เชื่อมต่อแล้ว"}
                    </Badge>
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => sendTestAction(h.id), `ส่งข้อความทดสอบให้ ${h.fullName} แล้ว`)}>
                      <Send /> ทดสอบ
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => confirm(`ยกเลิกการเชื่อมต่อ LINE ของ ${h.fullName}?`) && act(() => unlinkHostAction(h.id), "ยกเลิกการเชื่อมต่อแล้ว")}
                    >
                      <Link2Off /> ยกเลิก
                    </Button>
                  </>
                ) : h.pendingCode ? (
                  <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5">
                    <span className="text-xs text-amber-800">รหัสเชื่อมต่อ</span>
                    <code className="font-mono text-lg font-bold tracking-[0.3em]">{h.pendingCode}</code>
                    <button
                      type="button"
                      className="text-amber-800"
                      title="คัดลอกคำแนะนำ"
                      onClick={() =>
                        navigator.clipboard?.writeText(
                          `เพิ่มเพื่อน LINE ${config.basicId ?? "ของบริษัท"}${config.addFriendUrl ? ` (${config.addFriendUrl})` : ""} แล้วพิมพ์รหัส ${h.pendingCode} เพื่อรับแจ้งเตือนผู้มาติดต่อ (หมดอายุ ${h.codeExpiresText})`,
                        )
                      }
                    >
                      <Copy className="size-4" />
                    </button>
                    <span className="text-xs text-amber-800">หมดอายุ {h.codeExpiresText}</span>
                  </div>
                ) : (
                  <Button size="sm" disabled={pending} onClick={() => act(() => createLinkCodeAction(h.id), `สร้างรหัสเชื่อมต่อให้ ${h.fullName} แล้ว`)}>
                    <Link2 /> สร้างรหัสเชื่อมต่อ
                  </Button>
                )}
              </div>
            </div>
          ))}
          {shown.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">ไม่พบรายชื่อ</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>วิธีให้ Host เชื่อมต่อ LINE</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>กด “สร้างรหัสเชื่อมต่อ” ที่ชื่อ Host (รหัสใช้ได้ 24 ชม. ครั้งเดียว) แล้วกดไอคอนคัดลอกเพื่อส่งคำแนะนำให้ Host</li>
            <li>
              Host เพิ่มเพื่อน LINE OA{" "}
              {config.addFriendUrl ? (
                <a className="underline" href={config.addFriendUrl} target="_blank" rel="noreferrer">
                  {config.basicId}
                </a>
              ) : (
                "ของบริษัท"
              )}
            </li>
            <li>Host พิมพ์รหัส 6 หลักในแชต — ระบบตอบกลับ “เชื่อมต่อสำเร็จ”</li>
            <li>ครั้งต่อไปที่มีผู้มาพบ Host จะได้รับข้อความพร้อมปุ่มอนุมัติ E-Stamp</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
