/**
 * บัตรประชาชนจำลอง — ตอบ APDU แบบเดียวกับชิปจริง ใช้ทดสอบโดยไม่มีเครื่องอ่านบัตร
 * ข้อมูลเป็นบุคคลสมมติ (เลขบัตรขึ้นต้นด้วย 0 ซึ่งไม่ใช้กับบุคคลจริง)
 */
import type { Transmit } from "@/domain/idcard/thai-smartcard";

export interface FakeCardInfo {
  cid: string;
  thName: string;
  enName: string;
  birth: string;
  gender: "1" | "2";
  issue: string;
  expire: string;
  address: string;
  photo: Uint8Array | null;
}

export const SAMPLE_CARD: FakeCardInfo = {
  cid: "0999999999991",
  thName: "นาย#มานะ##รักเรียน",
  enName: "Mr.#Mana##Rakrian",
  birth: "25350115",
  gender: "1",
  issue: "25650101",
  expire: "25740114",
  address: "99/9#หมู่ที่ 1####ตำบลทดสอบ#อำเภอเมืองทดสอบ#จังหวัดนนทบุรี",
  photo: null,
};

function tis620(s: string, len: number): Uint8Array {
  const out = new Uint8Array(len).fill(0x20);
  let i = 0;
  for (const ch of s) {
    if (i >= len) break;
    const c = ch.codePointAt(0)!;
    out[i++] = c >= 0x0e01 && c <= 0x0e5b ? c - 0x0e01 + 0xa1 : c & 0x7f;
  }
  return out;
}

/** สร้างฟังก์ชัน transmit ที่ตอบเหมือนบัตรจริง (ตอบ 61 xx แล้วต้อง GET RESPONSE) */
export function fakeCardTransmit(card: FakeCardInfo = SAMPLE_CARD, opts: { notThaiId?: boolean } = {}): Transmit {
  const memory = new Map<number, Uint8Array>();
  const put = (off: number, bytes: Uint8Array) => memory.set(off, bytes);
  put(0x0004, tis620(card.cid, 13));
  put(0x0011, tis620(card.thName, 100));
  put(0x0075, tis620(card.enName, 100));
  put(0x00d9, tis620(card.birth, 8));
  put(0x00e1, tis620(card.gender, 1));
  put(0x0167, tis620(card.issue, 8));
  put(0x016f, tis620(card.expire, 8));
  put(0x1579, tis620(card.address, 100));
  const photo = new Uint8Array(20 * 0xff);
  if (card.photo) photo.set(card.photo.subarray(0, photo.length));
  for (let i = 0; i < 20; i++) put(0x017b + i * 0xff, photo.subarray(i * 0xff, (i + 1) * 0xff));

  let pending: Uint8Array | null = null;
  let selected = false;
  const ok = (data: Uint8Array) => Uint8Array.from([...data, 0x90, 0x00]);
  return async (apdu) => {
    const [cla, ins, p1, p2] = apdu;
    if (cla === 0x00 && ins === 0xa4) {
      if (opts.notThaiId) return Uint8Array.of(0x6a, 0x82);
      selected = true;
      return Uint8Array.of(0x61, 0x0a);
    }
    if (!selected) return Uint8Array.of(0x69, 0x85);
    if (cla === 0x80 && ins === 0xb0) {
      const data = memory.get((p1 << 8) | p2);
      if (!data) return Uint8Array.of(0x6b, 0x00);
      pending = data;
      return Uint8Array.of(0x61, data.length & 0xff);
    }
    if (cla === 0x00 && ins === 0xc0 && pending) {
      const d = pending;
      pending = null;
      return ok(d);
    }
    return Uint8Array.of(0x6d, 0x00);
  };
}
