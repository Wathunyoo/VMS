import "server-only";
import { cookies, headers } from "next/headers";

export const DEVICE_COOKIE = "vms_device";

export async function deviceToken(): Promise<string | null> {
  return (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
}

/** ผูกเครื่องนี้เป็นจุด Check-in (2 ปี) — เรียกใน Server Action เท่านั้น */
export async function setDeviceCookie(token: string) {
  const h = await headers();
  const secure = h.get("x-forwarded-proto") === "https" || process.env.APP_URL?.startsWith("https://") === true;
  (await cookies()).set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 2 * 365 * 24 * 3600,
  });
}

export async function clearDeviceCookie() {
  (await cookies()).delete(DEVICE_COOKIE);
}
