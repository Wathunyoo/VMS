"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, DatabaseBackup, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { backupNowAction } from "../actions";

export function BackupNowButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await backupNowAction();
            setMsg(r.ok ? { ok: true, text: `สำรองแล้ว: ${r.file}` } : { ok: false, text: r.error });
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <DatabaseBackup />} สำรองข้อมูลตอนนี้
      </Button>
      {msg && (
        <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "flex items-center gap-1 text-sm text-green-700" : "text-sm text-destructive"}>
          {msg.ok && <CheckCircle2 className="size-4" />} {msg.text}
        </span>
      )}
    </div>
  );
}
