import "server-only";
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { PasswordService } from "@/application/auth/auth.types";

const scrypt = (pw: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, keylen, opts, (e, k) => (e ? reject(e) : resolve(k))));

const PARAMS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;

/** รูปแบบ: scrypt$N$r$p$salt$hash (base64) */
async function hash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

async function verify(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(key, expected);
}

// ไม่มี 0/O/1/l/I เพื่อให้อ่าน/พิมพ์ตามได้ง่าย
const LETTERS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

function generateTemp(): string {
  const all = LETTERS + DIGITS;
  const chars = [
    LETTERS[randomInt(LETTERS.length)],
    DIGITS[randomInt(DIGITS.length)],
    ...Array.from({ length: 8 }, () => all[randomInt(all.length)]),
  ];
  // สลับตำแหน่ง
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export const scryptPasswords: PasswordService = { hash, verify, generateTemp };
