"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, Loader2, Lock, Power, UserPlus } from "lucide-react";
import type { StaffRole, StaffUserView } from "@/application/auth/auth.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { createStaffAction, listStaffAction, resetPasswordAction, setActiveAction, setStaffPointAction } from "../actions";

interface Props {
  initialUsers: StaffUserView[];
  currentUserId: string;
  /** จุด Check-in ขององค์กร (ว่าง = ไม่แสดงคอลัมน์ประจำจุด เช่น องค์กรผู้ให้บริการ) */
  points?: { id: string; name: string }[];
}

export function UsersAdmin({ initialUsers, currentUserId, points = [] }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  const [form, setForm] = useState({ username: "", fullName: "", role: "STAFF" as StaffRole, checkInPointId: "" });
  const [pending, startTransition] = useTransition();

  const reload = async () => {
    const r = await listStaffAction();
    if (r.ok) setUsers(r.data);
  };

  const act = <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, onOk: (d: T) => void) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        onOk(r.data);
        await reload();
      } else setError(r.error);
    });
  };

  return (
    <div className="space-y-5">
      {issued && (
        <Card className="border-amber-400 bg-amber-50">
          <CardContent className="space-y-2 pt-5 text-sm">
            <p className="font-medium">รหัสผ่านชั่วคราวของ “{issued.username}” — แสดงครั้งเดียว</p>
            <div className="flex items-center gap-2">
              <code className="rounded bg-white px-3 py-1.5 font-mono text-lg tracking-wider">{issued.password}</code>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(issued.password)}>
                <Copy /> คัดลอก
              </Button>
            </div>
            <p className="text-xs text-amber-800">
              ส่งให้เจ้าหน้าที่ด้วยตนเอง ระบบจะบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก
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
            <UserPlus className="size-5" /> เพิ่มเจ้าหน้าที่
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className={cn("grid gap-3 sm:items-end", points.length ? "sm:grid-cols-[1fr_1.5fr_140px_170px_auto]" : "sm:grid-cols-[1fr_1.5fr_140px_auto]")}
            onSubmit={(e) => {
              e.preventDefault();
              act(() => createStaffAction(form), (d) => {
                setIssued({ username: d.user.username, password: d.tempPassword });
                setForm({ username: "", fullName: "", role: "STAFF", checkInPointId: "" });
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="nu">ชื่อผู้ใช้</Label>
              <Input
                id="nu"
                placeholder="เช่น guard01"
                autoCapitalize="none"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nf">ชื่อ-นามสกุล</Label>
              <Input id="nf" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nr">บทบาท</Label>
              <NativeSelect id="nr" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}>
                <option value="STAFF">เจ้าหน้าที่</option>
                <option value="ADMIN">ผู้ดูแลระบบ</option>
              </NativeSelect>
            </div>
            {points.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="np">ประจำจุด</Label>
                <NativeSelect id="np" value={form.checkInPointId} onChange={(e) => setForm({ ...form, checkInPointId: e.target.value })}>
                  <option value="">— ไม่ผูกจุด —</option>
                  {points.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            <Button type="submit" disabled={pending || !form.username || !form.fullName}>
              {pending ? <Loader2 className="animate-spin" /> : <UserPlus />} เพิ่ม
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>เจ้าหน้าที่ทั้งหมด ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3">ชื่อผู้ใช้</th>
                <th className="py-2 pr-3">ชื่อ-นามสกุล</th>
                <th className="py-2 pr-3">บทบาท</th>
                {points.length > 0 && <th className="py-2 pr-3">ประจำจุด</th>}
                <th className="py-2 pr-3">สถานะ</th>
                <th className="py-2 pr-3">เข้าระบบล่าสุด</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={cn("border-b last:border-0", !u.isActive && "text-muted-foreground")}>
                  <td className="py-2.5 pr-3 font-mono">{u.username}</td>
                  <td className="py-2.5 pr-3">
                    {u.fullName}
                    {u.id === currentUserId && <span className="ml-1 text-xs text-muted-foreground">(คุณ)</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>{u.role === "ADMIN" ? "ผู้ดูแลระบบ" : "เจ้าหน้าที่"}</Badge>
                  </td>
                  {points.length > 0 && (
                    <td className="py-2.5 pr-3">
                      <NativeSelect
                        aria-label={`จุดประจำของ ${u.username}`}
                        className="h-8 min-w-36 text-xs"
                        value={u.checkInPointId ?? ""}
                        disabled={pending}
                        onChange={(e) => act(() => setStaffPointAction(u.id, e.target.value || null), () => {})}
                      >
                        <option value="">— ไม่ผูกจุด —</option>
                        {points.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </td>
                  )}
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {u.isActive ? <Badge className="bg-green-600 text-white">ใช้งาน</Badge> : <Badge variant="outline">ปิดใช้งาน</Badge>}
                      {u.locked && (
                        <Badge className="gap-1 bg-destructive text-white">
                          <Lock className="size-3" /> ล็อก
                        </Badge>
                      )}
                      {u.mustChangePassword && <Badge variant="warning">รอตั้งรหัสใหม่</Badge>}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-xs">{u.lastLoginText ?? "—"}</td>
                  <td className="py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          if (!confirm(`รีเซ็ตรหัสผ่านของ ${u.username}? ผู้ใช้จะถูกออกจากระบบทุกอุปกรณ์`)) return;
                          act(() => resetPasswordAction(u.id), (pw) => setIssued({ username: u.username, password: pw }));
                        }}
                      >
                        <KeyRound /> รีเซ็ตรหัส
                      </Button>
                      {u.id !== currentUserId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            if (u.isActive && !confirm(`ปิดใช้งานบัญชี ${u.username}?`)) return;
                            act(() => setActiveAction(u.id, !u.isActive), () => {});
                          }}
                        >
                          <Power /> {u.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
