"use client";

import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, type FormState } from "../actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, {});

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="current">รหัสผ่านปัจจุบัน</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="next">รหัสผ่านใหม่</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" required minLength={8} />
        <p className="text-xs text-muted-foreground">อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">ยืนยันรหัสผ่านใหม่</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      {state.error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} บันทึกรหัสผ่านใหม่
      </Button>
    </form>
  );
}
