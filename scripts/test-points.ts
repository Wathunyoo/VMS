/**
 * ทดสอบ: จุด Check-in ที่สร้างล่วงหน้า + เจ้าหน้าที่ประจำจุด
 *   npm run test:points
 * สร้างองค์กรทดสอบ 2 แห่ง แล้วลบทิ้งเมื่อจบ (ข้อมูลสมมติ)
 */
import "dotenv/config";
import type { CurrentStaff } from "@/application/auth/auth.types";
import { createStaff, listStaff, login, setStaffPoint } from "@/application/auth/auth.usecase";
import { checkStation, claimPoint, createPoint, registerDevice, revokeDevice } from "@/application/billing/devices.usecase";
import { authDeps, deviceDeps } from "@/container";
import { prisma } from "@/infrastructure/db/prisma";

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => boolean | Promise<boolean>) {
  try {
    const ok = await fn();
    ok ? passed++ : failed++;
    console.log(`${ok ? "  ✓" : "  ✗ FAIL"}  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ FAIL  ${name} — ${e instanceof Error ? e.message : e}`);
  }
}
const rejects = (p: Promise<unknown>, contains?: string) =>
  p.then(
    () => false,
    (e: Error) => !contains || e.message.includes(contains),
  );

const SLUGS = ["t-pt-a", "t-pt-b"];
async function cleanup() {
  const ids = (await prisma.organization.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } })).map((o) => o.id);
  if (!ids.length) return;
  const where = { organizationId: { in: ids } };
  await prisma.staffSession.deleteMany({ where: { user: where } });
  await prisma.staffUser.deleteMany({ where });
  await prisma.checkInPoint.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
}

const actor = (org: { id: string; slug: string; name: string }): CurrentStaff => ({
  id: "x",
  organizationId: org.id,
  orgSlug: org.slug,
  orgName: org.name,
  orgStatus: "ACTIVE",
  trialDaysLeft: null,
  needsOnboarding: false,
  username: "admin",
  fullName: "Admin",
  role: "ADMIN",
  mustChangePassword: false,
});

async function main() {
  await cleanup();
  const A = await prisma.organization.create({ data: { slug: SLUGS[0], name: "A", status: "ACTIVE", checkInPointLimit: 2, onboardedAt: new Date() } });
  const B = await prisma.organization.create({ data: { slug: SLUGS[1], name: "B", status: "ACTIVE", checkInPointLimit: 2, onboardedAt: new Date() } });
  const a = actor(A);
  const da = deviceDeps(A.id);

  console.log("\nสร้างจุดล่วงหน้า");
  const gate1 = await createPoint(a, "ประตู 1", da);
  await check("สร้างจุดได้โดยไม่ต้องมีเครื่อง · ยังไม่มีเครื่อง", async () => {
    const list = await da.devices.list();
    return list.length === 1 && list[0].id === gate1 && list[0].hasDevice === false;
  });
  await check("ชื่อสั้นเกินไป → ไม่ผ่าน", () => rejects(createPoint(a, "x", da), "ตั้งชื่อจุด"));
  await check("เจ้าหน้าที่ (ไม่ใช่ผู้ดูแล) สร้างจุดไม่ได้", () => rejects(createPoint({ ...a, role: "STAFF" }, "ประตู 9", da), "เฉพาะผู้ดูแล"));
  const token2 = await registerDevice(a, "ประตู 2", da);
  await check("จุดที่ยังไม่มีเครื่องก็นับโควตา (ครบ 2 จุดแล้วเพิ่มไม่ได้)", () => rejects(createPoint(a, "ประตู 3", da), "2 จุด"));

  console.log("\nเจ้าหน้าที่ประจำจุด");
  const { user: g1, tempPassword } = await createStaff(a, { username: "gate1", fullName: "รปภ. ประตูหนึ่ง", role: "STAFF", checkInPointId: gate1 }, authDeps);
  await check("สร้างบัญชีพร้อมผูกจุด + รหัสชั่วคราว", () => g1.checkInPointId === gate1 && tempPassword.length >= 8);
  await check("เข้าระบบ → รู้ว่าประจำจุดไหน", async () => (await login(SLUGS[0], "gate1", tempPassword, authDeps)).checkInPointId === gate1);
  const bPoint = await createPoint(actor(B), "B gate", deviceDeps(B.id));
  await check("ผูกกับจุดขององค์กรอื่นไม่ได้ (ตอนสร้าง/ตอนเปลี่ยน)", async () =>
    (await rejects(createStaff(a, { username: "other01", fullName: "ทดสอบ", role: "STAFF", checkInPointId: bPoint }, authDeps), "ไม่พบจุด")) &&
    (await rejects(setStaffPoint(a, g1.id, bPoint, authDeps), "ไม่พบจุด")));

  console.log("\nเครื่องของจุด");
  await check("จุดที่ยังไม่มีเครื่อง → Check-in ไม่ได้ (ไม่มี token)", async () => !(await checkStation(null, "CHECK_IN", da)).ok);
  const t1 = await claimPoint(gate1, da);
  await check("เครื่องแรกที่เจ้าหน้าที่ประจำจุดเข้าระบบ → เป็นจุดนั้น Check-in ได้", async () => {
    const st = await checkStation(t1, "CHECK_IN", da);
    return st.ok && st.device.id === gate1 && (await da.devices.list()).find((p) => p.id === gate1)?.hasDevice === true;
  });
  const t1b = await claimPoint(gate1, da);
  await check("เข้าระบบที่เครื่องใหม่ → เครื่องใหม่เป็นจุดนั้น เครื่องเดิมใช้ไม่ได้ (1 จุด = 1 เครื่อง)", async () =>
    (await checkStation(t1b, "CHECK_IN", da)).ok && !(await checkStation(t1, "CHECK_IN", da)).ok);
  await check("เครื่องที่ลงทะเบียนแบบเดิม (ประตู 2) ยังใช้ได้", async () => (await checkStation(token2, "CHECK_IN", da)).ok);
  await check("token ของจุดใช้กับองค์กรอื่นไม่ได้", async () => !(await checkStation(t1b, "CHECK_IN", deviceDeps(B.id))).ok);
  await check("ผูกเครื่องกับจุดขององค์กรอื่นไม่ได้", async () => (await claimPoint(bPoint, da)) === null);

  console.log("\nเปลี่ยน/ยกเลิก");
  const gate2 = (await da.devices.list()).find((p) => p.name === "ประตู 2")!.id;
  await setStaffPoint(a, g1.id, gate2, authDeps);
  await check("ย้ายเจ้าหน้าที่ไปอีกจุด", async () => (await listStaff(a, authDeps)).find((u) => u.id === g1.id)?.checkInPointId === gate2);
  await revokeDevice(a, gate2, da);
  await check("ยกเลิกจุด → เครื่องใช้ไม่ได้ · เจ้าหน้าที่ไม่ผูกจุดแล้ว · คืนโควตา", async () =>
    !(await checkStation(token2, "CHECK_IN", da)).ok &&
    (await listStaff(a, authDeps)).find((u) => u.id === g1.id)?.checkInPointId === null &&
    !!(await createPoint(a, "ประตู 3", da)));
  await check("ผูกเครื่องกับจุดที่ยกเลิกแล้วไม่ได้", async () => (await claimPoint(gate2, da)) === null);

  await cleanup();
  console.log(`\nผล: ผ่าน ${passed} / ${passed + failed}${failed ? `  —  ไม่ผ่าน ${failed}` : ""}`);
  if (failed) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
    await cleanup().catch(() => {});
  })
  .finally(() => prisma.$disconnect());
