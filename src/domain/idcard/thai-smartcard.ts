/**
 * อ่านบัตรประชาชนไทยแบบชิป (Smart Card) ผ่านเครื่องอ่านบัตร PC/SC
 * — ส่วนนี้ไม่ผูกกับฮาร์ดแวร์: รับ "transmit" (ส่ง APDU คืนคำตอบ) จากโปรแกรมเชื่อมเครื่องอ่านบัตร
 *
 * ลำดับ: SELECT applet กรมการปกครอง → อ่านแต่ละช่องด้วย READ BINARY (80 B0 ..) → GET RESPONSE (00 C0 ..)
 * ข้อความในบัตรเข้ารหัส TIS-620, วันที่เป็น พ.ศ. YYYYMMDD, ชื่อคั่นด้วย '#'
 */
import { isValidThaiNationalId } from "@/domain/visit/id-masking";

export type Transmit = (apdu: Uint8Array) => Promise<Uint8Array>;

export interface ThaiName {
  prefix: string;
  first: string;
  middle: string;
  last: string;
}

export interface ThaiIdCardData {
  cid: string;
  thName: ThaiName;
  enName: ThaiName;
  /** YYYY-MM-DD (ค.ศ.) — null ถ้าไม่ระบุวัน/เดือน */
  birthDate: string | null;
  gender: "M" | "F" | null;
  address: string;
  issueDate: string | null;
  expireDate: string | null;
  /** JPEG — มีเมื่อขออ่านรูป */
  photo: Uint8Array | null;
}

const SELECT_APPLET = [0x00, 0xa4, 0x04, 0x00, 0x08, 0xa0, 0x00, 0x00, 0x00, 0x54, 0x48, 0x00, 0x01];

/** ตำแหน่งข้อมูลในบัตร: [offset สูง, offset ต่ำ, ความยาว] */
const FIELDS = {
  cid: [0x00, 0x04, 0x0d],
  thName: [0x00, 0x11, 0x64],
  enName: [0x00, 0x75, 0x64],
  birth: [0x00, 0xd9, 0x08],
  gender: [0x00, 0xe1, 0x01],
  issue: [0x01, 0x67, 0x08],
  expire: [0x01, 0x6f, 0x08],
  address: [0x15, 0x79, 0x64],
} as const;

/** รูปถ่าย: 20 ช่วง ช่วงละ 255 ไบต์ เริ่มที่ 0x017B */
const PHOTO_PARTS = 20;

export class SmartCardError extends Error {}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");

/** SW 90 00 = สำเร็จ, 61 xx = มีข้อมูลรอ GET RESPONSE */
function status(r: Uint8Array): { sw1: number; sw2: number; data: Uint8Array } {
  if (r.length < 2) throw new SmartCardError("คำตอบจากบัตรสั้นผิดปกติ");
  return { sw1: r[r.length - 2], sw2: r[r.length - 1], data: r.subarray(0, r.length - 2) };
}

/**
 * บัตรบางรุ่น (ATR ขึ้นต้น 3B 67) ต้องส่ง GET RESPONSE ด้วย P2 = 01
 */
export function getResponseP2(atr: Uint8Array | null): number {
  return atr && atr[0] === 0x3b && atr[1] === 0x67 ? 0x01 : 0x00;
}

export async function selectApplet(transmit: Transmit): Promise<void> {
  const { sw1, sw2 } = status(await transmit(Uint8Array.from(SELECT_APPLET)));
  if (!(sw1 === 0x61 || (sw1 === 0x90 && sw2 === 0x00))) {
    throw new SmartCardError(`ไม่ใช่บัตรประชาชนไทย หรืออ่านบัตรไม่ได้ (SW ${hex(Uint8Array.of(sw1, sw2))})`);
  }
}

async function readBinary(transmit: Transmit, p1: number, p2: number, len: number, respP2: number): Promise<Uint8Array> {
  let r = status(await transmit(Uint8Array.of(0x80, 0xb0, p1, p2, 0x02, 0x00, len)));
  if (r.sw1 === 0x61) r = status(await transmit(Uint8Array.of(0x00, 0xc0, 0x00, respP2, r.sw2 || len)));
  if (!(r.sw1 === 0x90 && r.sw2 === 0x00)) throw new SmartCardError(`อ่านข้อมูลจากบัตรไม่สำเร็จ (SW ${r.sw1.toString(16)} ${r.sw2.toString(16)})`);
  return r.data;
}

/** TIS-620 → Unicode (ภาษาไทยอยู่ช่วง 0xA1–0xFB → U+0E01–U+0E5B) */
export function decodeTis620(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) {
    if (b === 0x00) continue;
    s += b >= 0xa1 && b <= 0xfb ? String.fromCharCode(0x0e01 + b - 0xa1) : String.fromCharCode(b);
  }
  return s.trim();
}

/** "นาย#สมชาย##ใจดี" → { prefix, first, middle, last } */
export function parseCardName(raw: string): ThaiName {
  const [prefix = "", first = "", middle = "", last = ""] = raw.split("#").map((x) => x.trim().replace(/\s+/g, " "));
  return { prefix, first, middle, last };
}

/** ชื่อสำหรับแสดง/บันทึก (ไม่รวมคำนำหน้า) */
export function displayName(n: ThaiName): string {
  return [n.first, n.middle, n.last].filter(Boolean).join(" ");
}

/** "25320115" (พ.ศ.) → "1989-01-15" · วัน/เดือนเป็น 00 (ไม่ทราบ) → null */
export function parseCardDate(raw: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const y = Number(m[1]) - 543;
  const [mo, d] = [Number(m[2]), Number(m[3])];
  if (y < 1800 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${m[2]}-${m[3]}`;
}

/** "99/1#หมู่ที่ 2####ตำบลบางรัก#อำเภอเมือง#จังหวัดนนทบุรี" → ที่อยู่บรรทัดเดียว */
export function parseCardAddress(raw: string): string {
  return raw
    .split("#")
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" ");
}

/** อ่านข้อมูลทั้งหมดจากบัตรที่เสียบอยู่ */
export async function readThaiIdCard(transmit: Transmit, opts: { atr?: Uint8Array | null; photo?: boolean } = {}): Promise<ThaiIdCardData> {
  const p2 = getResponseP2(opts.atr ?? null);
  await selectApplet(transmit);
  const read = async (f: readonly [number, number, number]) => decodeTis620(await readBinary(transmit, f[0], f[1], f[2], p2));

  const cid = (await read(FIELDS.cid)).replace(/\D/g, "");
  if (!isValidThaiNationalId(cid)) throw new SmartCardError("เลขประจำตัวประชาชนในบัตรไม่ถูกต้อง — ลองถอดแล้วเสียบบัตรใหม่");
  const thName = parseCardName(await read(FIELDS.thName));
  const enName = parseCardName(await read(FIELDS.enName));
  const birthDate = parseCardDate(await read(FIELDS.birth));
  const g = await read(FIELDS.gender);
  const issueDate = parseCardDate(await read(FIELDS.issue));
  const expireDate = parseCardDate(await read(FIELDS.expire));
  const address = parseCardAddress(await read(FIELDS.address));

  let photo: Uint8Array | null = null;
  if (opts.photo) {
    const parts: Uint8Array[] = [];
    for (let i = 0; i < PHOTO_PARTS; i++) {
      const off = 0x017b + i * 0xff;
      parts.push(await readBinary(transmit, (off >> 8) & 0xff, off & 0xff, 0xff, p2));
    }
    const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      all.set(p, at);
      at += p.length;
    }
    // ตัดส่วนท้ายหลัง JPEG end marker (FF D9)
    let end = all.length;
    for (let i = all.length - 2; i > 0; i--) {
      if (all[i] === 0xff && all[i + 1] === 0xd9) {
        end = i + 2;
        break;
      }
    }
    photo = all[0] === 0xff && all[1] === 0xd8 ? all.subarray(0, end) : null;
  }

  return { cid, thName, enName, birthDate, gender: g === "1" ? "M" : g === "2" ? "F" : null, address, issueDate, expireDate, photo };
}

/** บัตรหมดอายุแล้วหรือยัง ณ วันที่ todayYmd (YYYY-MM-DD) */
export function isCardExpired(expireDate: string | null, todayYmd: string): boolean {
  return !!expireDate && expireDate < todayYmd;
}

// ---------------------------------------------------------------
// ข้อความที่โปรแกรมเชื่อมเครื่องอ่านบัตรส่งให้หน้าเว็บ (Server-Sent Events)
// ---------------------------------------------------------------

export const CARD_AGENT_DEFAULT_URL = "http://127.0.0.1:47800";
export const CARD_AGENT_PROTOCOL = 1;

export interface CardAgentStatus {
  protocol: number;
  agent: string;
  /** ชื่อเครื่องอ่านบัตร (null = ไม่พบเครื่องอ่าน) */
  reader: string | null;
  card: "absent" | "present" | "reading";
}

/** event "card": ข้อมูลที่จำเป็นต่อการลงทะเบียนเท่านั้น (ไม่ส่งที่อยู่/วันเกิด) */
export interface CardAgentCard {
  cid: string;
  fullName: string;
  prefix: string;
  fullNameEn: string;
  expireDate: string | null;
  /** data:image/jpeg;base64,... หรือ null */
  photo: string | null;
}
