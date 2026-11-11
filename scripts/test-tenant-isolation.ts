/**
 * ทดสอบการแยกข้อมูลระหว่างองค์กร (multi-tenant isolation)
 *   npm run test:isolation              ← ทดสอบระดับ use case / repository
 *   npm run test:isolation -- --http    ← + ทดสอบผ่าน HTTP (ต้องเปิดเซิร์ฟเวอร์ที่ localhost:3000)
 * สร้างองค์กรทดสอบ 2 แห่ง ให้ beta พยายามเข้าถึงข้อมูลของ alpha ทุกช่องทาง แล้วลบข้อมูลทดสอบทิ้ง
 */
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { createStaff, listStaff, login, setStaffActive } from "@/application/auth/auth.usecase";
import type { CurrentStaff } from "@/application/auth/auth.types";
import { checkInSchema } from "@/application/check-in/check-in.schema";
import { checkInVisitor } from "@/application/check-in/check-in.usecase";
import { lookupVisit } from "@/application/check-out/check-out.usecase";
import { createLinkCode, listHostsForLine } from "@/application/host-line/host-line.usecase";
import { previewPurge, runPurge } from "@/application/retention/retention.usecase";
import { authDeps, checkInDeps, checkOutDeps, hostLineDeps, retentionDeps } from "@/container";
import { prisma } from "@/infrastructure/db/prisma";
import { db } from "@/infrastructure/db/tenant";
import { getVisitForPass } from "@/infrastructure/repositories/prisma-directory.repository";
import { createPassToken } from "@/infrastructure/security/pass-token";
import { scryptPasswords } from "@/infrastructure/security/password";

const { values: args } = parseArgs({ options: { http: { type: "boolean", default: false } } });
const BASE = "http://localhost:3000";
const SLUGS = ["t-alpha", "t-beta"];

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<boolean>) {
  try {
    const ok = await fn();
    ok ? passed++ : failed++;
    console.log(`${ok ? "  ✓" : "  ✗ FAIL"}  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ FAIL  ${name} — ${e instanceof Error ? e.message : e}`);
  }
}
const rejects = async (p: Promise<unknown>) => p.then(() => false, () => true);

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length === 0) return;
  const where = { organizationId: { in: ids } };
  await prisma.staffSession.deleteMany({ where: { user: where } });
  await prisma.visitEvent.deleteMany({ where });
  await prisma.vehicleInfo.deleteMany({ where });
  await prisma.factorySafetyCheck.deleteMany({ where });
  await prisma.visit.deleteMany({ where });
  await prisma.visitor.deleteMany({ where });
  await prisma.host.deleteMany({ where });
  await prisma.tenant.deleteMany({ where });
  await prisma.loadingBay.deleteMany({ where });
  await prisma.site.deleteMany({ where });
  await prisma.staffUser.deleteMany({ where });
  await prisma.dataPurgeLog.deleteMany({ where });
  await prisma.retentionSetting.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  await rm(path.join(process.cwd(), "storage/photos/faces/1999-01-01"), { recursive: true, force: true });
}

async function setupOrg(slug: string) {
  const org = await prisma.organization.create({ data: { slug, name: `Test ${slug}`, status: "ACTIVE", onboardedAt: new Date() } });
  const t = db(org.id);
  const site = await t.site.create({
    data: { organizationId: org.id, code: "HQ", name: `Site ${slug}`, mode: "OFFICE" },
  });
  const host = await t.host.create({ data: { organizationId: org.id, siteId: site.id, fullName: `Host ${slug}` } });
  const password = `Pw${randomBytes(6).toString("hex")}9`;
  const admin = await t.staffUser.create({
    data: {
      organizationId: org.id,
      username: "admin",
      fullName: `Admin ${slug}`,
      role: "ADMIN",
      mustChangePassword: false,
      passwordHash: await scryptPasswords.hash(password),
    },
  });
  const actor: CurrentStaff = {
    id: admin.id,
    organizationId: org.id,
    orgSlug: slug,
    orgName: org.name,
    orgStatus: "ACTIVE",
    trialDaysLeft: null,
    needsOnboarding: false,
    username: "admin",
    fullName: admin.fullName,
    role: "ADMIN",
    mustChangePassword: false,
  };
  return { org, site, host, admin, actor, password };
}

function checkInInput(siteId: string, hostId: string, name: string, idNumber = "SAME0001") {
  return checkInSchema.parse({
    mode: "OFFICE",
    siteId,
    hostId,
    fullName: name,
    idType: "PASSPORT",
    idNumber,
    pdpaConsent: "on",
    purpose: "MEETING",
    requireStamp: "on",
    highRiskWorks: [],
  });
}

async function main() {
  await cleanup();
  const A = await setupOrg("t-alpha");
  const B = await setupOrg("t-beta");
  const depsA = checkOutDeps(A.org.id);
  const depsB = checkOutDeps(B.org.id);

  // ข้อมูลของ alpha: visit ปกติ + visit เก่า (สำหรับทดสอบ retention) + รูป
  const { visitId: aVisit } = await checkInVisitor(checkInInput(A.site.id, A.host.id, "Visitor Alpha"), checkInDeps(A.org.id));
  const aRecord = (await depsA.visits.findById(aVisit))!;
  const photoUrl = `/photos/faces/1999-01-01/${"a".repeat(8)}-aaaa-aaaa-aaaa-${"a".repeat(12)}.jpg`;
  await mkdir(path.join(process.cwd(), "storage/photos/faces/1999-01-01"), { recursive: true });
  await writeFile(path.join(process.cwd(), "storage/photos/faces/1999-01-01", path.basename(photoUrl)), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  await db(A.org.id).visit.update({ where: { id: aVisit }, data: { facePhotoUrl: photoUrl } });
  const old = new Date("2000-01-01T00:00:00Z");
  await db(A.org.id).visit.update({ where: { id: aVisit }, data: {} }); // no-op (ยืนยัน update ภายในองค์กรได้)
  const { visitId: aOld } = await checkInVisitor(checkInInput(A.site.id, A.host.id, "Old Alpha", "OLD00001"), checkInDeps(A.org.id));
  await prisma.visit.update({ where: { id: aOld }, data: { status: "CHECKED_OUT", checkInAt: old, checkOutAt: old, expectedCheckOutAt: old } });

  console.log("\nระดับฐานข้อมูล (tenant-scoped client)");
  await check("beta เห็น visit เฉพาะของตัวเอง (findMany)", async () => (await db(B.org.id).visit.count()) === 0);
  await check("ส่ง where.organizationId ของ alpha มา ก็ยังถูกทับเป็น beta", async () =>
    (await db(B.org.id).visit.count({ where: { organizationId: A.org.id } })) === 0);
  await check("beta findUnique ด้วย id ของ alpha → null", async () => (await db(B.org.id).visit.findUnique({ where: { id: aVisit } })) === null);
  await check("beta updateMany visit ของ alpha → แก้ได้ 0 แถว", async () =>
    (await db(B.org.id).visit.updateMany({ where: { id: aVisit }, data: { purposeNote: "hacked" } })).count === 0);
  await check("beta update (unique) visit ของ alpha → error", () => rejects(db(B.org.id).visit.update({ where: { id: aVisit }, data: { purposeNote: "x" } })));
  await check("beta deleteMany รูป/visit ของ alpha → ลบได้ 0 แถว", async () =>
    (await db(B.org.id).visitEvent.deleteMany({ where: { visitId: aVisit } })).count === 0);

  console.log("\nCheck-in / Check-out");
  await check("beta ค้นรหัสบัตรของ alpha → ไม่พบ", () => rejects(lookupVisit(aRecord.passCode, depsB)));
  const qr = createPassToken({ vid: aVisit, pc: aRecord.passCode, n: "x", in: 0, exp: 0 });
  await check("beta สแกน QR (ลายเซ็นถูกต้อง) ของ alpha → ไม่พบ", () => rejects(lookupVisit(qr, depsB)));
  await check("alpha ค้นรหัสบัตรของตัวเองได้", async () => (await lookupVisit(aRecord.passCode, depsA)).visitId === aVisit);
  await check("beta check-in โดยใช้ Host ของ alpha → ถูกปฏิเสธ", () =>
    rejects(checkInVisitor(checkInInput(B.site.id, A.host.id, "Cross Org Host"), checkInDeps(B.org.id))));
  await check("beta check-in โดยใช้ Site ของ alpha → ถูกปฏิเสธ", () =>
    rejects(checkInVisitor(checkInInput(A.site.id, A.host.id, "Cross Org Site"), checkInDeps(B.org.id))));
  await checkInVisitor(checkInInput(B.site.id, B.host.id, "Visitor Beta"), checkInDeps(B.org.id));
  await check("เลขบัตรเดียวกันใน 2 องค์กร → เก็บเป็นคนละรายการ (ไม่เชื่อมข้อมูลข้ามองค์กร)", async () =>
    (await prisma.visitor.count({ where: { idNumberHash: (await prisma.visitor.findFirstOrThrow({ where: { organizationId: B.org.id } })).idNumberHash } })) === 2);
  await check("หน้าสลิป: beta เปิด visit ของ alpha → ไม่พบ", async () => (await getVisitForPass(B.org.id, aVisit)) === null);
  await check("รายชื่อผู้อยู่ในพื้นที่ของ beta ไม่มีคนของ alpha", async () =>
    (await depsB.visits.listActive()).every((v) => v.id !== aVisit));

  console.log("\nบัญชีเจ้าหน้าที่");
  await check("login ด้วยองค์กร beta + บัญชี/รหัสของ alpha → ไม่ผ่าน", () => rejects(login("t-beta", "admin", A.password, authDeps)));
  await check("login องค์กร alpha ด้วยรหัสของ alpha → ผ่าน และได้องค์กรถูกต้อง", async () =>
    (await login("t-alpha", "admin", A.password, authDeps)).organizationId === A.org.id);
  await check("ชื่อผู้ใช้ซ้ำกันได้ข้ามองค์กร (admin มีทั้ง 2 แห่ง)", async () => (await prisma.staffUser.count({ where: { username: "admin", organizationId: { in: [A.org.id, B.org.id] } } })) === 2);
  await check("แอดมิน beta เห็นเฉพาะผู้ใช้ของ beta", async () => (await listStaff(B.actor, authDeps)).every((u) => u.id !== A.admin.id));
  await check("แอดมิน beta ปิดบัญชีผู้ใช้ของ alpha → ไม่พบผู้ใช้", () => rejects(setStaffActive(B.actor, A.admin.id, false, authDeps)));
  await check("บัญชีของ alpha ยังใช้งานได้", async () => (await prisma.staffUser.findUniqueOrThrow({ where: { id: A.admin.id } })).isActive);
  await createStaff(B.actor, { username: "guard1", fullName: "Guard Beta", role: "STAFF" }, authDeps);
  await check("สร้างผู้ใช้ใน beta → อยู่ใน beta เท่านั้น", async () =>
    (await prisma.staffUser.findFirstOrThrow({ where: { username: "guard1", organizationId: { in: [A.org.id, B.org.id] } } })).organizationId === B.org.id);

  console.log("\nLINE / PDPA");
  await check("แอดมิน beta สร้างรหัส LINE ให้ Host ของ alpha → ไม่ได้", () => rejects(createLinkCode(B.actor, A.host.id, hostLineDeps(B.org.id))));
  await check("รายชื่อ Host ใน LINE ของ beta ไม่มี Host ของ alpha", async () =>
    (await listHostsForLine(B.actor, hostLineDeps(B.org.id))).every((h) => h.id !== A.host.id));
  await check("preview การลบของ beta ไม่นับข้อมูลเก่าของ alpha", async () => (await previewPurge(retentionDeps(B.org.id))).visitorsAnonymized === 0);
  await runPurge("MANUAL", retentionDeps(B.org.id), "test");
  await check("รันการลบของ beta → ข้อมูลเก่าของ alpha ไม่ถูกแตะ", async () =>
    (await prisma.visitor.findFirstOrThrow({ where: { visits: { some: { id: aOld } } } })).purgedAt === null);
  await check("ประวัติการลบของ beta ไม่ปรากฏใน alpha", async () => (await db(A.org.id).dataPurgeLog.count()) === 0);

  if (args.http) {
    console.log("\nผ่าน HTTP (เซิร์ฟเวอร์จริง)");
    const session = async (userId: string) => {
      const token = randomBytes(32).toString("base64url");
      await prisma.staffSession.create({
        data: { id: createHash("sha256").update(token).digest("hex"), userId, expiresAt: new Date(Date.now() + 3600_000) },
      });
      return `vms_session=${token}`;
    };
    const cookieA = await session(A.admin.id);
    const cookieB = await session(B.admin.id);
    const get = (p: string, cookie: string) => fetch(BASE + p, { headers: { cookie }, redirect: "manual" });
    await check("รูปของ alpha: แอดมิน alpha เปิดได้ (200)", async () => (await get(photoUrl, cookieA)).status === 200);
    await check("รูปของ alpha: แอดมิน beta เปิดไม่ได้ (404)", async () => (await get(photoUrl, cookieB)).status === 404);
    await check("หน้าสลิปของ alpha: แอดมิน beta → 404", async () => (await get(`/pass/${aVisit}`, cookieB)).status === 404);
    await check("หน้าสลิปของ alpha: แอดมิน alpha → 200", async () => (await get(`/pass/${aVisit}`, cookieA)).status === 200);
    await check("หน้า Check-out ของ beta ไม่มีชื่อผู้ติดต่อ alpha", async () => !(await (await get("/check-out", cookieB)).text()).includes("Visitor Alpha"));
    await check("หน้า Check-out ของ alpha มีชื่อผู้ติดต่อ alpha", async () => {
      const r = await get("/check-out", cookieA);
      const html = await r.text();
      const ok = html.includes("Visitor Alpha");
      if (!ok) console.log("    debug:", r.status, r.headers.get("location"), html.length, (html.match(/visitorName[^,]{0,60}/g) ?? []).slice(0, 3));
      return ok;
    });
    await prisma.organization.update({ where: { id: B.org.id }, data: { status: "SUSPENDED" } });
    await check("องค์กรถูกระงับ → session เดิมใช้ไม่ได้ทันที", async () => (await get("/check-in", cookieB)).status === 307);
  }

  console.log(`\nผล: ผ่าน ${passed} / ${passed + failed}${failed ? `  —  ไม่ผ่าน ${failed}` : ""}`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed", e));
    await prisma.$disconnect();
  });
