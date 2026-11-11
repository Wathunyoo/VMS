import { crc16 } from "./promptpay";

/**
 * QR ขนาดเล็กบนสลิปโอนเงินของธนาคารไทย (มาตรฐาน Slip Verification ของธนาคารแห่งประเทศไทย)
 * รูปแบบ TLV เช่น 0041 [00 06 000001][01 03 004][02 xx เลขอ้างอิงรายการ] 5102TH 9104 CRC
 * QR นี้มีแค่ "เลขอ้างอิงรายการ" — ไม่มียอดเงินหรือชื่อบัญชี ต้องถามธนาคาร/ผู้ให้บริการตรวจสลิปจึงจะรู้
 */
export interface SlipQr {
  payload: string;
  transRef: string;
  /** รหัสธนาคารผู้โอน 3 หลัก เช่น 004 = กสิกรไทย */
  sendingBank: string;
  crcOk: boolean;
}

function parseTlv(s: string): Map<string, string> | null {
  const out = new Map<string, string>();
  let i = 0;
  while (i < s.length) {
    if (i + 4 > s.length) return null;
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(len)) return null;
    if (i + 4 + len > s.length) return null;
    out.set(id, s.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return out;
}

export function parseSlipQr(raw: string): SlipQr | null {
  const payload = raw.trim();
  if (payload.length < 20 || payload.length > 128 || !/^[0-9A-Za-z]+$/.test(payload)) return null;
  const top = parseTlv(payload);
  if (!top || !top.has("00") || top.get("51") !== "TH") return null;
  const inner = parseTlv(top.get("00")!);
  if (!inner) return null;
  const transRef = inner.get("02");
  const sendingBank = inner.get("01");
  if (!transRef || transRef.length < 8 || !sendingBank || !/^\d{3}$/.test(sendingBank)) return null;
  const crc = top.get("91");
  const crcOk = !!crc && payload.endsWith(crc) && crc16(payload.slice(0, -4)).toUpperCase() === crc.toUpperCase();
  return { payload, transRef, sendingBank, crcOk };
}

/** ชื่อธนาคารจากรหัส (เท่าที่พบบ่อย) */
export const BANK_CODES: Record<string, string> = {
  "002": "กรุงเทพ",
  "004": "กสิกรไทย",
  "006": "กรุงไทย",
  "011": "ทหารไทยธนชาต",
  "014": "ไทยพาณิชย์",
  "022": "ซีไอเอ็มบี",
  "024": "ยูโอบี",
  "025": "กรุงศรีอยุธยา",
  "030": "ออมสิน",
  "033": "อาคารสงเคราะห์",
  "034": "ธ.ก.ส.",
  "066": "อิสลามแห่งประเทศไทย",
  "067": "ทิสโก้",
  "069": "เกียรตินาคินภัทร",
  "071": "ไทยเครดิต",
  "073": "แลนด์ แอนด์ เฮ้าส์",
};

/**
 * เลขบัญชีบนสลิปถูกปิดบางหลัก เช่น "xxx-x-x5678-x"
 * ตรงกัน = ทุกหลักที่เห็นตรงกับเลขบัญชีจริง (เทียบชิดขวา) และเห็นอย่างน้อย 3 หลัก
 */
export function maskedAccountMatches(masked: string | null | undefined, actual: string | null | undefined): boolean {
  if (!masked || !actual) return false;
  const m = masked.replace(/[^0-9xX*•]/g, "").toLowerCase();
  const a = actual.replace(/\D/g, "");
  if (!m || !a) return false;
  // เบอร์ PromptPay บนสลิปอาจขึ้นต้น 66 แทน 0
  const candidates = [a, a.startsWith("0") ? "66" + a.slice(1) : a];
  return candidates.some((acc) => {
    let seen = 0;
    for (let i = 1; i <= m.length; i++) {
      const c = m[m.length - i];
      if (!/\d/.test(c)) continue;
      const d = acc[acc.length - i];
      if (d === undefined || d !== c) return false;
      seen++;
    }
    return seen >= 3;
  });
}

/** เทียบชื่อบัญชีแบบหลวม — สลิปมักตัดชื่อให้สั้น เช่น "บจก. วีเอ็มเอส ซ" */
export function accountNameMatches(onSlip: string | null | undefined, expected: string | null | undefined): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/บริษัท|บจก\.?|บมจ\.?|จำกัด|\(มหาชน\)|มหาชน|หจก\.?|ห้างหุ้นส่วน|co\.?,?|ltd\.?|company|limited|นาย|นางสาว|นาง|mr\.?|mrs\.?|ms\.?/g, "")
      .replace(/[^0-9a-z฀-๿]/g, "");
  if (!onSlip || !expected) return false;
  const a = norm(onSlip);
  const b = norm(expected);
  if (a.length < 3 || b.length < 3) return false;
  return b.startsWith(a) || a.startsWith(b) || b.includes(a);
}
