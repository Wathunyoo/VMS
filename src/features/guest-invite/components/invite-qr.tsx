"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Check, Copy, Download, Send } from "lucide-react";
import type { ResidentInviteView } from "@/application/guest-invite/guest-invite.types";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";

/** วาดรูป "บัตรเชิญ" (QR + รายละเอียด) สำหรับบันทึก/ส่งเป็นรูป — ใช้ได้แม้ลิงก์ของระบบเปลี่ยน */
function composeCard(qr: HTMLCanvasElement, inv: ResidentInviteView): HTMLCanvasElement {
  const W = 640;
  const pad = 40;
  const lines = [
    { text: inv.placeText, font: "bold 30px sans-serif", color: "#111827" },
    { text: inv.windowText, font: "26px sans-serif", color: "#111827" },
    ...(inv.guestName ? [{ text: `แขก: ${inv.guestName}`, font: "24px sans-serif", color: "#374151" }] : []),
    ...(inv.plateNumber ? [{ text: `ทะเบียนรถ: ${inv.plateNumber}`, font: "24px sans-serif", color: "#374151" }] : []),
  ];
  const qrSize = W - pad * 2 - 80;
  const H = pad + 44 + 20 + qrSize + 30 + lines.length * 44 + 60 + pad;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  g.textAlign = "center";
  g.textBaseline = "top";
  g.fillStyle = "#16a34a";
  g.font = "bold 34px sans-serif";
  g.fillText(`${APP_NAME} · QR สำหรับแขก`, W / 2, pad);
  g.imageSmoothingEnabled = false;
  g.drawImage(qr, (W - qrSize) / 2, pad + 64, qrSize, qrSize);
  let y = pad + 64 + qrSize + 30;
  for (const l of lines) {
    g.font = l.font;
    g.fillStyle = l.color;
    g.fillText(l.text, W / 2, y, W - pad * 2);
    y += 44;
  }
  g.font = "22px sans-serif";
  g.fillStyle = "#6b7280";
  g.fillText("แสดง QR นี้ที่ป้อม รปภ.", W / 2, y + 16);
  return c;
}

export function InviteQr({ invite }: { invite: ResidentInviteView }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const saveImage = async () => {
    const qr = wrap.current?.querySelector("canvas");
    if (!qr) return;
    const card = composeCard(qr, invite);
    const blob = await new Promise<Blob | null>((r) => card.toBlob(r, "image/png"));
    if (!blob) return;
    const file = new File([blob], `qr-แขก-${invite.id.slice(-6)}.png`, { type: "image/png" });
    // มือถือ: เปิดเมนูแชร์ (ส่งรูปทาง LINE/บันทึกลงเครื่อง) · คอมพิวเตอร์: ดาวน์โหลด
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "QR สำหรับแขก" });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="space-y-3">
      <div ref={wrap} className="mx-auto w-fit rounded-xl border bg-white p-3">
        <QRCodeCanvas value={invite.guestUrl} size={220} marginSize={2} level="M" aria-label="QR สำหรับแขก" />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Button asChild className="bg-[#06c755] text-white hover:bg-[#05b34c]">
          <a href={`https://line.me/R/share?text=${encodeURIComponent(invite.shareText)}`} target="_blank" rel="noopener noreferrer">
            <Send /> ส่งทาง LINE
          </a>
        </Button>
        <Button type="button" variant="outline" onClick={saveImage}>
          <Download /> บันทึก/ส่งเป็นรูป
        </Button>
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? "คัดลอกแล้ว" : "คัดลอกข้อความ"}
        </Button>
      </div>
    </div>
  );
}
