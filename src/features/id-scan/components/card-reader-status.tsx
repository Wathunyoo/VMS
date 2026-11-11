"use client";

import { CreditCard, Loader2 } from "lucide-react";
import type { CardAgentCard } from "@/domain/idcard/thai-smartcard";
import { cn } from "@/lib/utils";
import { useCardReader } from "../card-reader";

/** ป้ายสถานะเครื่องอ่านบัตร — แสดงเฉพาะเครื่องที่เปิดโปรแกรมเชื่อมเครื่องอ่านบัตรไว้ */
export function CardReaderStatus({ onCard }: { onCard: (card: CardAgentCard) => void }) {
  const st = useCardReader(onCard);
  if (st.kind === "offline") return null;

  const [tone, text] =
    st.kind === "noreader"
      ? ["border-amber-300 bg-amber-50 text-amber-900", "ไม่พบเครื่องอ่านบัตร — ตรวจสาย USB"]
      : st.kind === "reading"
        ? ["border-sky-300 bg-sky-50 text-sky-900", "กำลังอ่านบัตร…"]
        : st.kind === "error"
          ? ["border-destructive/40 bg-destructive/10 text-destructive", st.message]
          : ["border-emerald-300 bg-emerald-50 text-emerald-900", "เครื่องอ่านบัตรพร้อม — เสียบบัตรได้เลย"];

  return (
    <span role="status" title={"reader" in st ? st.reader : undefined} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", tone)}>
      {st.kind === "reading" ? <Loader2 className="size-3.5 animate-spin" /> : <CreditCard className="size-3.5" />}
      {text}
    </span>
  );
}
