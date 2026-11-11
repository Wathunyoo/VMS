"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/** สแกน QR ด้วยกล้อง (jsQR — ประมวลผลในเครื่อง) */
export function QrScanner({ onDecode }: { onDecode: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;

    (async () => {
      try {
        const [{ default: jsQR }, media] = await Promise.all([
          import("jsqr"),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }),
        ]);
        stream = media;
        if (stopped) return media.getTracks().forEach((t) => t.stop());
        const video = videoRef.current!;
        video.srcObject = media;
        await video.play();
        setReady(true);

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        timer = setInterval(() => {
          if (!video.videoWidth) return;
          // ย่อภาพเพื่อความเร็ว
          const scale = Math.min(1, 800 / video.videoWidth);
          canvas.width = video.videoWidth * scale;
          canvas.height = video.videoHeight * scale;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            clearInterval(timer);
            onDecodeRef.current(code.data);
          }
        }, 200);
      } catch {
        setError("เปิดกล้องไม่ได้ — ใช้เครื่องสแกนบาร์โค้ด หรือพิมพ์รหัสบัตรแทน");
      }
    })();

    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
      <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
      {ready && <div className="pointer-events-none absolute left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 rounded-xl border-4 border-white/80" />}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white/80">
          {error ?? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> กำลังเปิดกล้อง…
            </span>
          )}
        </div>
      )}
    </div>
  );
}
