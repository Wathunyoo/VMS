/**
 * แยกเลขทะเบียนรถและจังหวัดจากข้อความ OCR ของป้ายทะเบียนไทย
 *  - รถทั่วไป:  "1กข 1234", "กข 1234", "1กข-1234"
 *  - รถบรรทุก/สาธารณะ: "70-1234", "10-1234"
 *  - จังหวัด: บรรทัดล่าง — เทียบแบบคลาดเคลื่อนได้กับรายชื่อ 77 จังหวัด
 * ใช้ได้ทั้ง client/server · ผลลัพธ์ต้องให้เจ้าหน้าที่ตรวจทานก่อนบันทึก
 */
export const THAI_PROVINCES = [
  "กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท",
  "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก", "นครปฐม", "นครพนม",
  "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน", "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์",
  "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา", "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์",
  "แพร่", "ภูเก็ต", "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยะลา", "ยโสธร", "ร้อยเอ็ด", "ระนอง", "ระยอง",
  "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ",
  "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", "สุรินทร์", "หนองคาย",
  "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี",
] as const;

export interface ParsedPlate {
  plateNumber: string | null;
  province: string | null;
}

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const toArabic = (s: string) => s.replace(/[๐-๙]/g, (c) => String(THAI_DIGITS.indexOf(c)));
// OCR มักสับสนตัวอักษรกับตัวเลขในส่วนตัวเลขของป้าย
const DIGIT_FIX: Record<string, string> = { O: "0", o: "0", D: "0", I: "1", l: "1", "|": "1", S: "5", B: "8", Z: "2" };

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** จังหวัดที่ใกล้เคียงที่สุด (ยอมคลาดเคลื่อน ~35%) — ไม่มีที่ใกล้พอ = null */
export function matchProvince(text: string): string | null {
  const t = text.replace(/[^฀-๿]/g, "");
  if (t.length < 2) return null;
  if (/กรุงเทพ|กทม/.test(t)) return "กรุงเทพมหานคร";
  let best: { p: string; score: number } | null = null;
  for (const p of THAI_PROVINCES) {
    // เทียบทั้งบรรทัด และช่วงข้อความยาวเท่าชื่อจังหวัด (OCR อาจมีตัวอักษรเกินมา)
    let d = levenshtein(t, p);
    if (t.length > p.length) for (let i = 0; i + p.length <= t.length; i++) d = Math.min(d, levenshtein(t.slice(i, i + p.length), p));
    const score = 1 - d / p.length;
    if (!best || score > best.score) best = { p, score };
  }
  return best && best.score >= 0.65 ? best.p : null;
}

export function parsePlateText(raw: string): ParsedPlate {
  const lines = toArabic(raw)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let plateNumber: string | null = null;
  let plateLine = -1;
  for (let i = 0; i < lines.length && !plateNumber; i++) {
    const l = lines[i].replace(/[“”"'`.,:;_]/g, " ");
    // หมวด (ตัวเลข 0-1 หลัก + พยัญชนะ 1-2 ตัว) + เลข 1-4 หลัก
    const m = /(\d?)\s*([ก-ฮ]{1,2})\s*[-–]?\s*([0-9OoDIl|SBZ]{1,4})(?![0-9])/.exec(l);
    if (m) {
      const num = m[3].replace(/[OoDIl|SBZ]/g, (c) => DIGIT_FIX[c]);
      if (/^\d{1,4}$/.test(num)) {
        plateNumber = `${m[1]}${m[2]} ${num}`;
        plateLine = i;
        continue;
      }
    }
    // รถบรรทุก/รถสาธารณะ: 70-1234
    const t = /(?<![0-9])(\d{2})\s*[-–]\s*(\d{4})(?![0-9])/.exec(l);
    if (t) {
      plateNumber = `${t[1]}-${t[2]}`;
      plateLine = i;
    }
  }

  // จังหวัด: บรรทัดหลังเลขทะเบียนก่อน แล้วค่อยลองบรรทัดอื่น
  const order = plateLine >= 0 ? [...lines.slice(plateLine + 1), ...lines.slice(0, plateLine)] : lines;
  let province: string | null = null;
  for (const l of order) {
    province = matchProvince(l);
    if (province) break;
  }
  return { plateNumber, province };
}

/** ผล OCR แยกส่วนของป้าย (ดู recognizePlate ใน ocr-engine) */
export interface PlateOcrParts {
  /** บรรทัดบน อ่านด้วยพยัญชนะไทย + ตัวเลข */
  line: string;
  /** บรรทัดบนทั้งบรรทัด อ่านเฉพาะตัวเลขและขีด (จับป้ายรถบรรทุก 70-1234) */
  digitsFull: string;
  /** ครึ่งขวาของบรรทัดบน อ่านเฉพาะตัวเลข (เลขทะเบียน) */
  digitsRight: string;
  /** บรรทัดล่าง (จังหวัด) */
  province: string;
}

/**
 * รวมผลหลายรอบ: หมวดจากรอบภาษาไทย + เลขจากรอบตัวเลขล้วน (แม่นกว่าสำหรับตัวเลข)
 * ป้ายรถบรรทุกตรวจจากรอบตัวเลขทั้งบรรทัด
 */
export function parsePlateOcr(p: PlateOcrParts): ParsedPlate {
  const province = matchProvince(p.province) ?? parsePlateText(`${p.line}\n${p.province}`).province;
  const truck = /(?<![0-9])(\d{2})\s*[-–]\s*(\d{4})(?![0-9])/.exec(toArabic(p.digitsFull));
  if (truck && !/[ก-ฮ]/.test(p.line.replace(/^\D*/, "").slice(0, 3))) return { plateNumber: `${truck[1]}-${truck[2]}`, province };

  const cat = /(\d?)\s*([ก-ฮ]{1,2})/.exec(toArabic(p.line));
  const number = voteNumber(p);
  if (cat && number) return { plateNumber: `${cat[1]}${cat[2]} ${number}`, province };
  return { plateNumber: parsePlateText(p.line).plateNumber, province };
}

/** เลขทะเบียน (1–4 หลักท้ายหมวด) จากแต่ละรอบการอ่าน */
function trailingNumber(text: string, fromLine = false): string | null {
  const t = toArabic(text);
  if (fromLine) {
    // ต่อจากหมวด: "จจ 9595" → 9595 (ตัวอักษรที่ OCR สับสนแก้ให้แล้ว)
    const m = /[ก-ฮ]\s*[-–]?\s*([0-9OoDIl|SBZ]{1,4})(?![0-9])/.exec(t);
    const n = m?.[1].replace(/[OoDIl|SBZ]/g, (c) => DIGIT_FIX[c]);
    return n && /^\d{1,4}$/.test(n) ? n : null;
  }
  const runs = t.match(/\d+/g);
  if (!runs?.length) return null;
  const last = runs[runs.length - 1];
  // เลขนำหน้าหมวดอาจติดมาด้วย (1กข 1234 → 11234) → ใช้ 4 หลักท้าย
  return last.length > 4 ? last.slice(-4) : last;
}

/**
 * ให้แต่ละรอบ “โหวต” เลขทะเบียน:
 *  บรรทัดไทย+ตัวเลข ตรงกับ ตัวเลขทั้งบรรทัด → ใช้ค่านั้น (ครึ่งขวาอาจตัดตัวเลขหลักแรกขาด)
 *  ไม่ตรงกัน → ใช้ครึ่งขวา (แม่นสุดเมื่อฟอนต์ทำให้ตัวเลขถูกอ่านเป็นตัวอักษร)
 */
function voteNumber(p: PlateOcrParts): string | null {
  const fromLine = trailingNumber(p.line, true);
  const fromFull = trailingNumber(p.digitsFull);
  const fromRight = trailingNumber(p.digitsRight);
  if (fromLine && fromLine === fromFull) return fromLine;
  if (fromRight && (fromRight === fromLine || fromRight === fromFull)) return fromRight;
  return fromRight ?? fromLine ?? fromFull;
}
