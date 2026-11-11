import "server-only";
import sharp from "sharp";
import jsQR from "jsqr";
import type { SlipQrReader } from "@/application/billing/billing.types";
import { parseSlipQr } from "@/domain/billing/slip-qr";

type Region = { left: number; top: number; width: number; height: number };

/**
 * อ่าน QR จากรูปสลิปด้วย sharp + jsQR — ทำในเครื่องทั้งหมด
 * QR บนสลิปมักเล็กและอยู่มุมล่าง จึงลองหลายขนาดและหลายส่วนของภาพ
 * คืน QR ตรวจสอบสลิปถ้าเจอ ไม่เช่นนั้นคืน QR แรกที่อ่านได้ (หรือ null)
 */
export const localSlipQrReader: SlipQrReader = {
  async read(bytes) {
    const meta = await sharp(bytes).rotate().metadata();
    const W = meta.autoOrient?.width ?? meta.width;
    const H = meta.autoOrient?.height ?? meta.height;
    if (!W || !H) return null;

    const half = (r: Partial<Region>): Region => ({ left: 0, top: 0, width: W, height: H, ...r });
    const regions: Region[] = [
      half({}),
      half({ top: Math.floor(H / 2), height: H - Math.floor(H / 2) }),
      half({ left: Math.floor(W / 2), top: Math.floor(H / 2), width: W - Math.floor(W / 2), height: H - Math.floor(H / 2) }),
      half({ left: Math.floor(W / 2), width: W - Math.floor(W / 2) }),
      half({ height: Math.floor(H / 2) }),
    ];
    let fallback: string | null = null;
    for (const target of [1400, 900, 2000]) {
      for (const r of regions) {
        const scale = Math.min(1, target / Math.max(r.width, r.height));
        const { data, info } = await sharp(bytes)
          .rotate()
          .extract(r)
          .resize(Math.max(1, Math.round(r.width * scale)), Math.max(1, Math.round(r.height * scale)))
          .flatten({ background: "#ffffff" })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const code = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, {
          inversionAttempts: "attemptBoth",
        });
        if (!code?.data) continue;
        if (parseSlipQr(code.data)) return code.data;
        fallback ??= code.data;
      }
    }
    return fallback;
  },
};
