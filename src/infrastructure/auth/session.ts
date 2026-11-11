import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { CurrentStaff } from "@/application/auth/auth.types";
import { staffGate } from "@/application/auth/access-gate";
import { toCurrentStaff } from "@/application/auth/auth.usecase";
import { platformOrgSlug } from "../billing/seller";
import { prisma } from "../db/prisma";

export const SESSION_COOKIE = "vms_session";
const SESSION_HOURS = 12; // 1 กะ

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** สร้าง session + ตั้ง cookie (เรียกได้เฉพาะใน Server Action / Route Handler) */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  const h = await headers();
  const userAgent = h.get("user-agent")?.slice(0, 200);
  // Secure เมื่อเข้าผ่าน HTTPS (tunnel ส่ง x-forwarded-proto) — localhost แบบ http ยัง login ได้
  const secure = h.get("x-forwarded-proto") === "https" || process.env.APP_URL?.startsWith("https://") === true;

  await prisma.staffSession.create({ data: { id: hashToken(token), userId, expiresAt, userAgent } });
  // ล้าง session ที่หมดอายุแล้วของผู้ใช้คนนี้
  await prisma.staffSession.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.staffSession.deleteMany({ where: { id: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

/** session id (hash) ของ request ปัจจุบัน */
export async function currentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/** ผู้ใช้ปัจจุบัน — cache ต่อ 1 request */
export const getCurrentUser = cache(async (): Promise<CurrentStaff | null> => {
  const id = await currentSessionId();
  if (!id) return null;
  const session = await prisma.staffSession.findUnique({
    where: { id },
    include: {
      user: {
        include: {
          organization: { select: { slug: true, name: true, status: true, trialEndsAt: true, onboardedAt: true } },
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;
  // องค์กรถูกระงับ / ยังไม่ยืนยันอีเมล → session ใช้ไม่ได้
  const status = session.user.organization.status;
  if (status === "SUSPENDED" || status === "PENDING") return null;
  const staff = toCurrentStaff(session.user, session.user.organization);
  // องค์กรผู้ให้บริการ (main) ดูแลแพลตฟอร์มอย่างเดียว — ไม่มีสถานที่/Check-in จึงไม่ต้องตั้งค่าเริ่มต้น
  return isPlatformOrg(staff) ? { ...staff, needsOnboarding: false } : staff;
});

/** องค์กรของผู้ให้บริการ (PLATFORM_ORG_SLUG) — ไม่ได้ใช้ Check-in / Check-out */
export const isPlatformOrg = (u: Pick<CurrentStaff, "orgSlug">) => u.orgSlug === platformOrgSlug();

/** หน้าแรกหลังเข้าระบบ: ผู้ให้บริการ → ลูกค้า · ลูกค้า → เมนูหลักของจุด รปภ. */
export const homePath = (u: Pick<CurrentStaff, "orgSlug">) => (isPlatformOrg(u) ? "/platform/customers" : "/home");

/** ใช้ในทุกหน้า/ทุก action ที่ต้อง login — redirect ถ้าไม่ผ่าน */
export async function requireStaff(
  opts: { allowMustChangePassword?: boolean; allowOnboarding?: boolean } = {},
): Promise<CurrentStaff> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const to = staffGate(user, opts);
  if (to) redirect(to);
  return user;
}

export async function requireAdmin(): Promise<CurrentStaff> {
  const user = await requireStaff();
  if (user.role !== "ADMIN") redirect(homePath(user));
  return user;
}

/** หน้างานของจุด รปภ. (Check-in / Check-out / รายงาน) — องค์กรผู้ให้บริการไม่มีหน้าเหล่านี้ */
export async function requireOperator(opts: Parameters<typeof requireStaff>[0] = {}): Promise<CurrentStaff> {
  const user = await requireStaff(opts);
  if (isPlatformOrg(user)) redirect(homePath(user));
  return user;
}

/** ตั้งค่าที่เกี่ยวกับสถานที่ (รายชื่อ แบบฟอร์ม จุด Check-in LINE PDPA) — ผู้ให้บริการมีเฉพาะ "เจ้าหน้าที่" */
export async function requireOrgAdmin(): Promise<CurrentStaff> {
  const user = await requireAdmin();
  if (isPlatformOrg(user)) redirect("/admin/users");
  return user;
}
