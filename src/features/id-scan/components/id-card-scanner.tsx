"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, ImageUp, Loader2, RefreshCw, ScanLine, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { maskIdNumber } from "@/domain/visit/id-masking";
import { parseIdCardText, type ParsedIdCard } from "@/domain/visit/id-card-parser";
import { ID_TYPE_LABEL } from "@/domain/visit/labels";
import { getOcrWorker, recognizeCard, recognizeMrz } from "../ocr-engine";

/** อัตราส่วนบัตรมาตรฐาน ID-1 (85.6 × 54 mm) */
const CARD_RATIO = 85.6 / 54;
/** กรอบนำสายตา = 86% ของความกว้างภาพ */
const GUIDE_W = 0.86;

const DETECTED_LABEL: Record<ParsedIdCard["detected"], string> = {
  THAI_ID: "บัตรประชาชน",
  DRIVER_LICENSE: "ใบขับขี่",
  PASSPORT: "หนังสือเดินทาง",
  UNKNOWN: "ไม่ทราบประเภท",
};

type Phase = "camera" | "reading" | "result" | "error";

interface Props {
  /** cardImage = ภาพบัตร (JPEG data URL) เมื่อ keepImage เปิด */
  onApply: (result: ParsedIdCard, cardImage: string | null) => void;
  /** เก็บภาพบัตรไว้ในระบบ (ตามการตั้งค่าแบบฟอร์ม) */
  keepImage?: boolean;
}

/** ย่อภาพบัตรให้พอดูรายละเอียดได้ และไฟล์ไม่ใหญ่เกินไป */
function toCardJpeg(source: HTMLCanvasElement, maxW = 1100): string {
  const scale = Math.min(1, maxW / source.width);
  const c = document.createElement("canvas");
  c.width = Math.round(source.width * scale);
  c.height = Math.round(source.height * scale);
  c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.85);
  c.width = c.height = 0;
  return url;
}

export function IdCardScanner({ onApply, keepImage = false }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <ScanLine /> สแกนบัตร (กรอกอัตโนมัติ)
      </Button>
      {open && (
        <ScannerDialog
          keepImage={keepImage}
          onClose={() => setOpen(false)}
          onApply={(r, img) => {
            onApply(r, img);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ScannerDialog({ onClose, onApply, keepImage }: { onClose: () => void; onApply: Props["onApply"]; keepImage: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("camera");
  const [camReady, setCamReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ParsedIdCard | null>(null);
  const [cardImage, setCardImage] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setMessage(null);
    setPhase("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamReady(true);
    } catch {
      setMessage("เปิดกล้องไม่ได้ — ใช้ปุ่ม “อัปโหลดรูป” แทนได้");
    }
  }, []);

  useEffect(() => {
    void startCamera();
    // โหลดโมเดล OCR ล่วงหน้าระหว่างที่ผู้ใช้จัดบัตร
    getOcrWorker().catch(() => {});
    return stopCamera;
  }, [startCamera, stopCamera]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const runOcr = async (canvas: HTMLCanvasElement) => {
    stopCamera();
    setPhase("reading");
    setProgress(0);
    // เก็บภาพบัตรก่อนปรับภาพสำหรับ OCR (ตามการตั้งค่าขององค์กร)
    setCardImage(keepImage ? toCardJpeg(canvas) : null);
    try {
      // ข้อความดิบมีข้อมูลอ่อนไหว (ศาสนา/ที่อยู่) — ใช้แยกข้อมูลแล้วทิ้ง ไม่ log/ไม่เก็บ
      let parsed = parseIdCardText(await recognizeCard(canvas, (p) => setProgress(p * 0.7)));
      if (!parsed.idNumber) {
        // ไม่พบเลขบัตร — ลองอ่านแบบพาสปอร์ต (แถบ MRZ ด้านล่าง)
        const mrz = parseIdCardText(await recognizeMrz(canvas, (p) => setProgress(0.7 + p * 0.3)));
        if (mrz.detected === "PASSPORT") parsed = mrz;
      }
      setResult(parsed);
      setPhase("result");
    } catch (e) {
      console.error("[ocr]", e);
      setMessage("อ่านบัตรไม่สำเร็จ กรุณาลองใหม่");
      setPhase("error");
    } finally {
      canvas.width = canvas.height = 0; // ปล่อยภาพออกจากหน่วยความจำ
    }
  };

  /** ตัดเฉพาะส่วนในกรอบบัตร */
  const capture = () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const w = v.videoWidth * GUIDE_W;
    const h = Math.min(v.videoHeight * 0.95, w / CARD_RATIO);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    canvas.getContext("2d")!.drawImage(v, (v.videoWidth - w) / 2, (v.videoHeight - h) / 2, w, h, 0, 0, w, h);
    void runOcr(canvas);
  };

  const onFile = (file?: File) => {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      void runOcr(canvas);
    };
    img.src = URL.createObjectURL(file);
  };

  const canApply = !!result && (!!result.idNumber || !!result.fullName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="สแกนบัตร">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <ScanLine className="size-5" /> สแกนบัตรประชาชน / ใบขับขี่ / พาสปอร์ต
          </h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="ปิด">
            <X />
          </Button>
        </div>

        <div className="space-y-4 p-5">
          {phase === "camera" && (
            <>
              <div className="relative overflow-hidden rounded-lg bg-black">
                <video ref={videoRef} playsInline muted className="block h-auto w-full" />
                {camReady && (
                  <div
                    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                    style={{ width: `${GUIDE_W * 100}%`, aspectRatio: `${CARD_RATIO}` }}
                  />
                )}
                {!camReady && (
                  <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-white/80">
                    {message ?? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" /> กำลังเปิดกล้อง…
                      </span>
                    )}
                  </div>
                )}
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                <li>วางบัตร<b>ด้านหน้า</b>ให้เต็มกรอบสีขาว ถือให้นิ่งและขนานกับกล้อง</li>
                <li>หลีกเลี่ยงแสงสะท้อนบนบัตร · พาสปอร์ตให้เห็นแถบตัวอักษร 2 บรรทัดด้านล่าง</li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={capture} disabled={!camReady}>
                  <Camera /> ถ่ายและอ่านบัตร
                </Button>
                <Button type="button" variant="outline" asChild>
                  <label className="cursor-pointer">
                    <ImageUp /> อัปโหลดรูป
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
                  </label>
                </Button>
              </div>
            </>
          )}

          {phase === "reading" && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm">กำลังอ่านข้อมูลจากบัตร… {Math.round(progress * 100)}%</p>
              <div className="h-1.5 w-60 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">ครั้งแรกอาจใช้เวลานานขึ้นเล็กน้อย (โหลดโมเดลภาษาไทย)</p>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-3 py-6 text-center">
              <AlertTriangle className="mx-auto size-8 text-destructive" />
              <p className="text-sm">{message}</p>
              <Button type="button" onClick={startCamera}>
                <RefreshCw /> ลองใหม่
              </Button>
            </div>
          )}

          {phase === "result" && result && (
            <div className="space-y-4">
              <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 rounded-lg border p-4 text-sm">
                <dt className="text-muted-foreground">เอกสารที่พบ</dt>
                <dd>{DETECTED_LABEL[result.detected]}</dd>
                <dt className="text-muted-foreground">ชื่อ-นามสกุล</dt>
                <dd className="font-medium">{result.fullName ?? <span className="text-muted-foreground">—</span>}</dd>
                <dt className="text-muted-foreground">{ID_TYPE_LABEL[result.idType]}</dt>
                <dd className="flex items-center gap-2 font-mono">
                  {result.idNumber ? maskIdNumber(result.idNumber, result.idType) : <span className="text-muted-foreground">—</span>}
                  {result.idNumber &&
                    (result.idNumberVerified ? (
                      <CheckCircle2 className="size-4 text-green-600" aria-label="ตรวจสอบเลขแล้ว" />
                    ) : (
                      <AlertTriangle className="size-4 text-amber-500" aria-label="ยังไม่ยืนยัน" />
                    ))}
                </dd>
              </dl>

              {result.warnings.length > 0 && (
                <ul className="space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                  {result.warnings.map((w) => (
                    <li key={w} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}

              {cardImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cardImage} alt="ภาพบัตรที่จะบันทึก" className="max-h-44 rounded-md border object-contain" />
              )}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" />
                {keepImage
                  ? "อ่านข้อมูลในเครื่องนี้ · ภาพบัตรบันทึกในระบบ เปิดดูได้เฉพาะเจ้าหน้าที่ และลบอัตโนมัติตามนโยบาย PDPA"
                  : "อ่านในเครื่องนี้เท่านั้น ภาพบัตรไม่ถูกบันทึกหรือส่งออก · ระบบไม่เก็บศาสนา/ที่อยู่/วันเกิด"}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => onApply(result, cardImage)} disabled={!canApply && !cardImage}>
                  <CheckCircle2 /> ใช้ข้อมูลนี้
                </Button>
                <Button type="button" variant="outline" onClick={startCamera}>
                  <RefreshCw /> ถ่ายใหม่
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
