import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { SecurityService } from "@/application/ports";

// ไม่มี 0/O/1/I/L เพื่อให้อ่านบนสลิปได้ง่าย
const PASS_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function secret(name: "ID_HASH_SECRET" | "PASS_TOKEN_SECRET"): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function hmac(value: string, key: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

export const cryptoSecurity: SecurityService = {
  hashIdNumber: (normalizedId) => hmac(normalizedId, secret("ID_HASH_SECRET")),

  generatePassCode: () =>
    "V-" + Array.from({ length: 6 }, () => PASS_ALPHABET[randomInt(PASS_ALPHABET.length)]).join(""),

  generateStampToken: () => randomBytes(24).toString("base64url"),

  generateOtp: () => {
    const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");
    return { otp, otpHash: hmac(otp, secret("PASS_TOKEN_SECRET")) };
  },

  verifyOtp: (otp, otpHash) => {
    const a = Buffer.from(hmac(otp.trim(), secret("PASS_TOKEN_SECRET")));
    const b = Buffer.from(otpHash);
    return a.length === b.length && timingSafeEqual(a, b);
  },
};
