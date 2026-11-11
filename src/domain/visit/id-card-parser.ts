/**
 * แยกข้อมูลจากข้อความ OCR ของบัตร — pure functions (ไม่มี I/O)
 *
 * PDPA: ดึงเฉพาะ ชื่อ + เลขเอกสาร เท่านั้น
 * ไม่ดึง ศาสนา (ข้อมูลอ่อนไหว ม.26) / ที่อยู่ / วันเกิด / เลขหลังบัตร (Laser ID)
 */
import { isValidThaiNationalId } from "./id-masking";
import type { IdDocumentType } from "./types";

export type DetectedDocument = "THAI_ID" | "DRIVER_LICENSE" | "PASSPORT" | "UNKNOWN";

export interface ParsedIdCard {
  detected: DetectedDocument;
  idType: IdDocumentType;
  idNumber?: string;
  /** true เมื่อเลขผ่าน checksum (บัตรประชาชน) หรือ check digit (พาสปอร์ต) */
  idNumberVerified: boolean;
  fullName?: string;
  warnings: string[];
}

// ตัวอักษรที่ OCR มักอ่านสลับกับตัวเลข
const DIGIT_LOOKALIKES: Record<string, string> = {
  O: "0", o: "0", D: "0", Q: "0", U: "0",
  I: "1", l: "1", i: "1", "|": "1", "!": "1",
  Z: "2", z: "2",
  S: "5", s: "5",
  G: "6", b: "6",
  T: "7",
  B: "8",
  g: "9", q: "9",
};

const TH_TITLES = "นางสาว|น\\.ส\\.|นาง|นาย|เด็กชาย|เด็กหญิง|ด\\.ช\\.|ด\\.ญ\\.";

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** หาเลขบัตรประชาชน 13 หลักที่ผ่าน checksum (ทนต่อช่องว่าง/ขีด/ตัวอักษรหน้าตาคล้ายตัวเลข) */
export function findThaiNationalId(text: string): string | undefined {
  const all = lines(text);
  // ให้บรรทัดที่มีคำว่า "เลขประจำตัว"/"Identification" มาก่อน
  const ordered = [
    ...all.filter((l) => /เลขประจำตัว|Identification|ID\s*No/i.test(l)),
    ...all,
  ];
  for (const line of ordered) {
    for (const variant of [line, line.replace(/[A-Za-z|!]/g, (c) => DIGIT_LOOKALIKES[c] ?? c)]) {
      // ตัดตัวคั่นที่อยู่ระหว่างตัวเลขออก
      const compact = variant.replace(/(?<=\d)[\s\-.·,]+(?=\d)/g, "");
      for (const run of compact.match(/\d{13,}/g) ?? []) {
        for (let i = 0; i + 13 <= run.length; i++) {
          const candidate = run.slice(i, i + 13);
          if (isValidThaiNationalId(candidate)) return candidate;
        }
      }
    }
  }
  return undefined;
}

function cleanThai(s: string): string {
  // OCR ภาษาไทยมักแทรกช่องว่างระหว่างสระ/วรรณยุกต์ — รวมกลับ
  return s.replace(/\s+(?=[ัิ-ฺ็-๎])/g, "").trim();
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

export function findThaiName(text: string): string | undefined {
  const re = new RegExp(`(?:${TH_TITLES})\\s*([\\u0E01-\\u0E4E]{2,})\\s+([\\u0E01-\\u0E4E]{2,})`);
  for (const line of lines(text)) {
    const m = re.exec(line);
    if (m) return cleanThai(`${m[1]} ${m[2]}`);
  }
  return undefined;
}

export function findEnglishName(text: string): string | undefined {
  const t = lines(text).join("\n");
  const first = /(?<!Last ?)Name *[:.]? *(?:Mr|Mrs|Miss|Ms|Master)\.? *([A-Za-z][A-Za-z-]+(?: [A-Za-z][A-Za-z-]+)?)/i.exec(t);
  const last = /Last ?name *[:.]? *([A-Za-z][A-Za-z-]+)/i.exec(t);
  if (first && last) return titleCase(`${first[1]} ${last[1]}`);
  // ใบขับขี่: "Mr. SOMCHAI JAIDEE"
  const inline = /\b(?:Mr|Mrs|Miss|Ms)\.? +([A-Z][A-Za-z-]+) +([A-Z][A-Za-z-]+)/.exec(t);
  if (inline) return titleCase(`${inline[1]} ${inline[2]}`);
  return undefined;
}

// ---------------- Passport (MRZ TD3: 2 บรรทัด × 44 ตัว) ----------------

function mrzCheckDigit(s: string): number {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const v = c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55; // A=10
    sum += v * weights[i % 3];
  }
  return sum % 10;
}

/** ชื่อจาก MRZ ดูสมเหตุสมผลไหม — ถ้า "<" ถูก OCR อ่านเป็น K/L จะเห็นตัวอักษรเดี่ยวหรือตัวซ้ำยาว ๆ */
function looksLikeRealName(name: string): boolean {
  const tokens = name.split(" ").filter(Boolean);
  return (
    tokens.length >= 2 &&
    tokens.length <= 6 &&
    tokens.every((t) => t.length >= 2) &&
    !/(.)\1{3,}/i.test(name)
  );
}

export function parseMrz(text: string): { passportNo: string; fullName?: string; verified: boolean } | undefined {
  const candidates = lines(text)
    .map((l) => l.replace(/\s/g, "").replace(/[«‹(]/g, "<").toUpperCase())
    .filter((l) => l.length >= 40 && /^[A-Z0-9<]+$/.test(l));
  const l1Idx = candidates.findIndex((l) => l.startsWith("P"));
  if (l1Idx < 0 || !candidates[l1Idx + 1]) return undefined;

  const l1 = candidates[l1Idx];
  const l2 = candidates[l1Idx + 1];

  const [surname = "", given = ""] = l1.slice(5).split("<<");
  const fullName = titleCase(`${given.replace(/<+/g, " ")} ${surname.replace(/<+/g, " ")}`.trim());

  const rawNo = l2.slice(0, 9);
  const passportNo = rawNo.replace(/<+$/, "");
  const verified = mrzCheckDigit(rawNo) === Number(l2[9]);

  if (!passportNo) return undefined;
  return { passportNo, fullName: looksLikeRealName(fullName) ? fullName : undefined, verified };
}

// ---------------- Entry point ----------------

export function parseIdCardText(text: string): ParsedIdCard {
  const warnings: string[] = [];

  const mrz = parseMrz(text);
  if (mrz) {
    if (!mrz.verified) warnings.push("เลขพาสปอร์ตอาจอ่านผิด กรุณาตรวจสอบ");
    if (!mrz.fullName) warnings.push("อ่านชื่อจากแถบ MRZ ไม่ชัด กรุณากรอกชื่อเอง");
    return {
      detected: "PASSPORT",
      idType: "PASSPORT",
      idNumber: mrz.passportNo,
      idNumberVerified: mrz.verified,
      fullName: mrz.fullName,
      warnings,
    };
  }

  const isLicense = /ใบอนุญาตขับ|Driving\s*Licen[cs]e|Driver.?s?\s*Licen[cs]e/i.test(text);
  const nationalId = findThaiNationalId(text);
  const fullName = findThaiName(text) ?? findEnglishName(text);

  if (!fullName) warnings.push("อ่านชื่อไม่ได้ กรุณากรอกเอง");

  if (nationalId) {
    // ใบขับขี่ไทยมีเลขประจำตัวประชาชนพิมพ์อยู่ — ใช้เลขนี้เพราะตรวจ checksum ได้และใช้ระบุตัวบุคคลซ้ำได้
    if (isLicense) warnings.push("อ่านจากใบขับขี่ — ใช้เลขประจำตัวประชาชนที่พิมพ์บนใบขับขี่");
    return {
      detected: isLicense ? "DRIVER_LICENSE" : "THAI_ID",
      idType: "NATIONAL_ID",
      idNumber: nationalId,
      idNumberVerified: true,
      fullName,
      warnings,
    };
  }

  if (isLicense) {
    const licNo = /(?:ฉบับที่|No\.?)\s*[:.]?\s*([0-9OoIlSB]{8})\b/.exec(text)?.[1]?.replace(
      /[OoIlSB]/g,
      (c) => DIGIT_LOOKALIKES[c] ?? c,
    );
    if (!licNo) warnings.push("อ่านเลขใบขับขี่ไม่ได้ กรุณากรอกเอง");
    return { detected: "DRIVER_LICENSE", idType: "DRIVER_LICENSE", idNumber: licNo, idNumberVerified: false, fullName, warnings };
  }

  warnings.push("ไม่พบเลขบัตรที่ถูกต้อง ลองถ่ายใหม่ให้บัตรเต็มกรอบและไม่สะท้อนแสง");
  return { detected: "UNKNOWN", idType: "NATIONAL_ID", idNumberVerified: false, fullName, warnings };
}
