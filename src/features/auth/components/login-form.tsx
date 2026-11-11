"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type FormState } from "../actions";

const ORG_KEY = "vms.org";

export function LoginForm({ next, org: orgFromUrl }: { next?: string; org?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  const [org, setOrg] = useState(orgFromUrl ?? "");

  // จำรหัสองค์กรล่าสุดของเครื่องนี้ (แท็บเล็ต รปภ. มักใช้องค์กรเดียว)
  useEffect(() => {
    if (orgFromUrl) return;
    try {
      const saved = localStorage.getItem(ORG_KEY);
      if (saved) setOrg(saved);
    } catch {}
  }, [orgFromUrl]);

  return (
    <form
      action={action}
      onSubmit={() => {
        try {
          localStorage.setItem(ORG_KEY, org.trim().toLowerCase());
        } catch {}
      }}
      className="space-y-4"
    >
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="space-y-1.5">
        <Label htmlFor="org">รหัสองค์กร</Label>
        <Input
          id="org"
          name="org"
          autoCapitalize="none"
          autoComplete="organization"
          placeholder="เช่น acme"
          required
          className="h-11"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="username">ชื่อผู้ใช้</Label>
        <Input id="username" name="username" autoComplete="username" autoCapitalize="none" autoFocus required className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
      </div>
      {state.error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />} เข้าสู่ระบบ
      </Button>
    </form>
  );
}
