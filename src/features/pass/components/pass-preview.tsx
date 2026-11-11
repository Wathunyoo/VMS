"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PassViewModel } from "../pass-view-model";
import { PrintablePass, type PaperWidth } from "./printable-pass";

const STORAGE_KEY = "vms.paperWidth";

export function PassPreview({ pass, autoPrint }: { pass: PassViewModel; autoPrint?: boolean }) {
  const [paper, setPaper] = useState<PaperWidth>(80);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (saved === 58 || saved === 80) setPaper(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (!autoPrint) return;
    // รอรูป/QR render ก่อนสั่งพิมพ์
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [autoPrint]);

  const choose = (w: PaperWidth) => {
    setPaper(w);
    try {
      localStorage.setItem(STORAGE_KEY, String(w));
    } catch {}
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="no-print flex flex-wrap items-center justify-center gap-2">
        <div className="flex rounded-md border p-0.5">
          {([80, 58] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => choose(w)}
              className={cn("rounded px-3 py-1 text-sm", paper === w && "bg-primary text-primary-foreground")}
            >
              {w} mm
            </button>
          ))}
        </div>
        <Button onClick={() => window.print()}>
          <Printer /> พิมพ์สลิป
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/check-in?mode=${pass.mode.toLowerCase()}`}>
            <UserPlus /> ลงทะเบียนคนถัดไป
          </Link>
        </Button>
      </div>

      <PrintablePass pass={pass} paperWidth={paper} />
    </div>
  );
}
