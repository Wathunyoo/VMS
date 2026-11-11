"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ImageUp, RefreshCw, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CameraCaptureProps {
  /** ชื่อ field ใน FormData (ส่งเป็น JPEG data URL) */
  name: string;
  label: string;
  /** "user" = กล้องหน้า (ถ่ายหน้า), "environment" = กล้องหลัง (ถ่ายป้ายทะเบียน) */
  facingMode?: "user" | "environment";
  /** อัตราส่วนกรอบภาพ */
  aspect?: "portrait" | "landscape";
  maxWidth?: number;
  error?: string;
  /** เรียกเมื่อได้ภาพใหม่ — guided = ถ่ายจากกล้องโดยจัดภาพในกรอบนำสายตา */
  onCapture?: (dataUrl: string, guided: boolean) => void;
}

export function CameraCapture({
  name,
  label,
  facingMode = "user",
  aspect = "portrait",
  maxWidth = 640,
  error,
  onCapture,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [photo, setPhoto] = useState<string>("");
  const [camError, setCamError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(-1); // -1 = ใช้ facingMode

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    async (index = deviceIndex) => {
      setCamError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError("เบราว์เซอร์ไม่รองรับกล้อง (ต้องเปิดผ่าน HTTPS หรือ localhost)");
        return;
      }
      stop();
      try {
        const video: MediaTrackConstraints =
          index >= 0 && devices[index]
            ? { deviceId: { exact: devices[index].deviceId } }
            : { facingMode: { ideal: facingMode } };
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { ...video, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setActive(true);
        // label ของอุปกรณ์จะอ่านได้หลังได้รับอนุญาตแล้วเท่านั้น
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "videoinput"));
      } catch (e) {
        const err = e as DOMException;
        setCamError(
          err.name === "NotAllowedError"
            ? "ไม่ได้รับอนุญาตให้ใช้กล้อง"
            : err.name === "NotFoundError"
              ? "ไม่พบกล้อง"
              : "เปิดกล้องไม่สำเร็จ",
        );
      }
    },
    [devices, deviceIndex, facingMode, stop],
  );

  const switchCamera = () => {
    if (devices.length < 2) return;
    const next = (deviceIndex + 1) % devices.length;
    setDeviceIndex(next);
    void start(next);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d")!;
    if (facingMode === "user" && deviceIndex < 0) {
      // ภาพจากกล้องหน้าแสดงแบบกระจก — กลับด้านให้ตรงกับของจริงก่อนบันทึก
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", 0.8);
    setPhoto(url);
    onCapture?.(url, aspect === "landscape");
    stop();
  };

  /** Fallback: อัปโหลดไฟล์ / กล้องมือถือผ่าน <input capture> */
  const onFile = (file?: File) => {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", 0.8);
      setPhoto(url);
      onCapture?.(url, false);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  };

  const mirrored = facingMode === "user" && deviceIndex < 0;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <input type="hidden" name={name} value={photo} />

      <div
        className={cn(
          "relative overflow-hidden rounded-lg border-2 border-dashed bg-muted",
          aspect === "portrait" ? "aspect-[3/4]" : "aspect-video",
          error && "border-destructive",
        )}
      >
        {/* video อยู่ใน DOM ตลอดเพื่อให้ ref พร้อมก่อน play() */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={cn("h-full w-full object-cover", mirrored && "-scale-x-100", !active && "hidden")}
        />
        {/* ระหว่างเปิดกล้อง (ถ่ายใหม่) แสดงภาพสดแทนภาพเดิม — กดยกเลิกแล้วภาพเดิมยังอยู่ */}
        {photo && !active && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={label} className="h-full w-full object-cover" />
        )}
        {!active && !photo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
            {camError ? <CameraOff className="size-8" /> : <Camera className="size-8" />}
            <span className="text-xs">{camError ?? "ยังไม่มีภาพ"}</span>
          </div>
        )}
        {active && aspect === "landscape" && (
          <div className="pointer-events-none absolute inset-x-[15%] inset-y-[30%] rounded border-2 border-white/80" />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {active ? (
          <>
            <Button type="button" size="sm" onClick={capture}>
              <Camera /> ถ่ายภาพ
            </Button>
            {devices.length > 1 && (
              <Button type="button" size="sm" variant="outline" onClick={switchCamera}>
                <SwitchCamera /> สลับกล้อง
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={stop}>
              ยกเลิก
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="sm" variant={photo ? "outline" : "default"} onClick={() => start()}>
              {photo ? <RefreshCw /> : <Camera />} {photo ? "ถ่ายใหม่" : "เปิดกล้อง"}
            </Button>
            <Button type="button" size="sm" variant="outline" asChild>
              <label className="cursor-pointer">
                <ImageUp /> อัปโหลด
                <input
                  type="file"
                  accept="image/*"
                  capture={facingMode}
                  className="sr-only"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </label>
            </Button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
