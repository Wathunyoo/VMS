"use client";

import type { Worker } from "tesseract.js";

/**
 * OCR ในเบราว์เซอร์ (Tesseract.js) — ไฟล์ทั้งหมดโหลดจาก /ocr ของเซิร์ฟเวอร์เราเอง
 * การอ่านทำในเครื่องนี้ทั้งหมด — ภาพไม่ถูกส่งไปบริการภายนอก
 * (ภาพบัตรบันทึกในระบบขององค์กรเฉพาะเมื่อแบบฟอร์มตั้ง "เก็บภาพบัตร")
 */
let workerPromise: Promise<Worker> | null = null;
let mrzWorkerPromise: Promise<Worker> | null = null;
let progressListener: ((p: number) => void) | null = null;

async function createLocalWorker(langs: string[]): Promise<Worker> {
  const { createWorker, OEM } = await import("tesseract.js");
  const origin = window.location.origin;
  return createWorker(langs, OEM.LSTM_ONLY, {
    workerPath: `${origin}/ocr/worker.min.js`,
    corePath: `${origin}/ocr/core`,
    langPath: `${origin}/ocr/lang`,
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === "recognizing text") progressListener?.(m.progress);
    },
  });
}

export function getOcrWorker(): Promise<Worker> {
  workerPromise ??= createLocalWorker(["tha", "eng"]).catch((e) => {
    workerPromise = null; // ให้ลองใหม่ได้
    throw e;
  });
  return workerPromise;
}

/** Worker แยกสำหรับแถบ MRZ ของพาสปอร์ต — อังกฤษล้วน + จำกัดตัวอักษร A-Z 0-9 < */
function getMrzWorker(): Promise<Worker> {
  mrzWorkerPromise ??= (async () => {
    const { PSM } = await import("tesseract.js");
    const w = await createLocalWorker(["eng"]);
    await w.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    return w;
  })().catch((e) => {
    mrzWorkerPromise = null;
    throw e;
  });
  return mrzWorkerPromise;
}

/** ปรับภาพก่อนอ่าน: ขยาย, ขาวดำ, เพิ่ม contrast */
function preprocess(source: HTMLCanvasElement): HTMLCanvasElement {
  const targetW = 1800;
  const scale = targetW / source.width;
  const c = document.createElement("canvas");
  c.width = targetW;
  c.height = Math.round(source.height * scale);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, c.width, c.height);

  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** อ่านเฉพาะส่วนล่างของภาพ (ตำแหน่งแถบ MRZ) */
export async function recognizeMrz(canvas: HTMLCanvasElement, onProgress?: (p: number) => void): Promise<string> {
  const worker = await getMrzWorker();
  const top = Math.floor(canvas.height * 0.6);
  const strip = document.createElement("canvas");
  strip.width = canvas.width;
  strip.height = canvas.height - top;
  strip.getContext("2d")!.drawImage(canvas, 0, top, canvas.width, strip.height, 0, 0, canvas.width, strip.height);
  progressListener = onProgress ?? null;
  try {
    const { data } = await worker.recognize(preprocess(strip));
    return data.text;
  } finally {
    progressListener = null;
    strip.width = strip.height = 0;
  }
}

export async function recognizeCard(canvas: HTMLCanvasElement, onProgress?: (p: number) => void): Promise<string> {
  const worker = await getOcrWorker();
  progressListener = onProgress ?? null;
  try {
    const { data } = await worker.recognize(preprocess(canvas));
    return data.text;
  } finally {
    progressListener = null;
  }
}

// ---------------- ป้ายทะเบียน ----------------

const THAI_CONSONANTS = "กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ";
const THAI_MARKS = "ะัาำิีึืุูเแโใไ็่้๊๋์ฯๆ";
let plateThaiWorker: Promise<Worker> | null = null;
let plateDigitWorker: Promise<Worker> | null = null;

function lazyWorker(ref: "thai" | "digit"): Promise<Worker> {
  const make = async () => {
    const { PSM } = await import("tesseract.js");
    const w = await createLocalWorker(ref === "thai" ? ["tha"] : ["eng"]);
    await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, ...(ref === "digit" ? { tessedit_char_whitelist: "0123456789-" } : {}) });
    return w;
  };
  if (ref === "thai") return (plateThaiWorker ??= make().catch((e) => ((plateThaiWorker = null), Promise.reject(e))));
  return (plateDigitWorker ??= make().catch((e) => ((plateDigitWorker = null), Promise.reject(e))));
}

/**
 * อ่านป้ายทะเบียนเป็นส่วน ๆ (ทดสอบแล้วแม่นกว่าอ่านทั้งป้ายครั้งเดียว):
 *  บรรทัดบน (หมวด+เลข) · ครึ่งขวาบรรทัดบน (เลขล้วน) · บรรทัดล่าง (จังหวัด)
 * guided = ถ่ายจากกล้องโดยจัดป้ายในกรอบ → ตัดเฉพาะบริเวณกรอบก่อน
 */
export async function recognizePlate(dataUrl: string, guided: boolean): Promise<import("@/domain/visit/plate-parser").PlateOcrParts> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  // กรอบเดียวกับที่แสดงตอนถ่าย (ซ้าย-ขวา 15%, บน-ล่าง 30%) ขยายขอบเล็กน้อยกันตัวอักษรขาด
  const [bx, by, bw, bh] = guided ? [0.1 * img.width, 0.22 * img.height, 0.8 * img.width, 0.56 * img.height] : [0, 0, img.width, img.height];
  const strip = (x0: number, x1: number, y0: number, y1: number) => {
    const c = document.createElement("canvas");
    c.width = Math.round(bw * (x1 - x0));
    c.height = Math.round(bh * (y1 - y0));
    c.getContext("2d")!.drawImage(img, bx + bw * x0, by + bh * y0, c.width, c.height, 0, 0, c.width, c.height);
    return preprocess(c);
  };
  const [thai, digit] = await Promise.all([lazyWorker("thai"), lazyWorker("digit")]);
  const read = async (w: Worker, c: HTMLCanvasElement) => {
    try {
      return (await w.recognize(c)).data.text.trim();
    } finally {
      c.width = c.height = 0;
    }
  };
  await thai.setParameters({ tessedit_char_whitelist: `${THAI_CONSONANTS}0123456789- ` });
  const line = await read(thai, strip(0, 1, 0.08, 0.62));
  await thai.setParameters({ tessedit_char_whitelist: THAI_CONSONANTS + THAI_MARKS });
  const province = await read(thai, strip(0, 1, 0.55, 0.95));
  const digitsFull = await read(digit, strip(0, 1, 0.08, 0.62));
  const digitsRight = await read(digit, strip(0.5, 1, 0.08, 0.62));
  return { line, digitsFull, digitsRight, province };
}
