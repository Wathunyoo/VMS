import "server-only";
import { toBangkokLocal } from "@/domain/invite/guest-invite";
import { db } from "@/infrastructure/db/tenant";

/** ตัวเลขบนเมนูหลัก: คนที่ยังอยู่ในพื้นที่ · เข้าวันนี้ · แขกที่แจ้งล่วงหน้าวันนี้ (ยังไม่มา) */
export async function kioskSummary(orgId: string, now = new Date()) {
  const prisma = db(orgId);
  const day = toBangkokLocal(now).slice(0, 10);
  const start = new Date(`${day}T00:00:00+07:00`);
  const end = new Date(`${day}T23:59:59+07:00`);
  const [inside, today, invites] = await Promise.all([
    prisma.visit.count({ where: { status: "CHECKED_IN" } }),
    prisma.visit.count({ where: { checkInAt: { gte: start, lte: end } } }),
    prisma.guestInvite.count({ where: { status: "ACTIVE", validUntil: { gte: now }, validFrom: { lte: end } } }),
  ]);
  return { inside, today, invites };
}
