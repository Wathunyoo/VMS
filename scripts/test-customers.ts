/**
 * ทดสอบการสร้างลูกค้าโดยผู้ให้บริการ (ติดตั้งที่หน้างาน) + onboarding
 *   npm run test:customers
 * สร้างองค์กรทดสอบแล้วลบทิ้งเมื่อจบ
 */
import "dotenv/config";
import { changeOwnPassword, login } from "@/application/auth/auth.usecase";
import { addDirectory, createFirstSite, finishOnboarding } from "@/application/onboarding/onboarding.usecase";
import { createCustomer, resetCustomerAdmin, resumeCustomer, suspendCustomer, updateCustomerContract } from "@/application/platform/customers.usecase";
import { importDirectory, saveUnit, setUnitActive } from "@/application/directory/directory-admin.usecase";
import { authDeps, customersDeps, directoryAdminDeps, onboardingDeps } from "@/container";
import { prisma } from "@/infrastructure/db/prisma";
import { db } from "@/infrastructure/db/tenant";
import { staffGate } from "@/application/auth/access-gate";
import { contractDateFromYmd, contractStatus, contractYmd } from "@/domain/org/contract";
import { customersCsv, EMPTY_FILTER, matchCustomer, parseCustomerFilter, type CustomerView } from "@/features/customers/customer-view";

/** เดินตาม redirect เหมือนเบราว์เซอร์ — คืนหน้าที่ไปถึง หรือ "LOOP" ถ้าวนเกิน 5 ครั้ง */
const PAGES: Record<string, { allowMustChangePassword?: boolean; allowOnboarding?: boolean }> = {
  "/check-in": {},
  "/account/password": { allowMustChangePassword: true },
  "/onboarding": { allowOnboarding: true },
};
function landOn(user: { mustChangePassword: boolean; needsOnboarding: boolean; role: "ADMIN" | "STAFF" }, start: string) {
  let page = start;
  for (let i = 0; i < 5; i++) {
    const to = staffGate(user, PAGES[page]);
    if (!to) return page;
    page = to;
  }
  return "LOOP";
}

const SLUG = "t-cust-a";
const SLUG2 = "t-cust-b";
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

async function cleanup() {
  const ids = (await prisma.organization.findMany({ where: { slug: { in: [SLUG, SLUG2] } }, select: { id: true } })).map((o) => o.id);
  if (!ids.length) return;
  const where = { organizationId: { in: ids } };
  await prisma.staffSession.deleteMany({ where: { user: where } });
  await prisma.host.deleteMany({ where });
  await prisma.tenant.deleteMany({ where });
  await prisma.loadingBay.deleteMany({ where });
  await prisma.site.deleteMany({ where });
  await prisma.staffUser.deleteMany({ where });
  await prisma.checkInPoint.deleteMany({ where });
  await prisma.billingProfile.deleteMany({ where });
  await prisma.dataPurgeLog.deleteMany({ where });
  await prisma.retentionSetting.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  await cleanup();
  const deps = customersDeps();
  const base = { name: "หมู่บ้านทดสอบติดตั้ง", slug: SLUG, mode: "VILLAGE", contactEmail: "Juristic@Example.com", adminUsername: "admin", plan: "TRIAL", trialDays: 30,
    pointLimit: 3, houseLimit: 3, contractEndsAt: "2027-09-30", legalName: "นิติบุคคลหมู่บ้านทดสอบ", taxId: "0-1055-56000-00-9", branch: "สำนักงานใหญ่", address: "99/1 ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพฯ 10100" };

  console.log("\nวันสิ้นสุดสัญญา (ปฏิทินไทย)");
  const now = new Date("2026-10-07T20:00:00Z"); // 8 ต.ค. 03:00 น. เวลาไทย
  await check("วันที่ → 00:00 น. ไทย และแปลงกลับได้ตรง", () => contractYmd(contractDateFromYmd("2027-01-31")!) === "2027-01-31" && contractDateFromYmd("2027-02-30") === null);
  await check("สิ้นสุดวันนี้ = เหลือ 0 วัน (ยังไม่หมด), เมื่อวาน = หมดแล้ว", () =>
    contractStatus(contractDateFromYmd("2026-10-08"), now).daysLeft === 0 && contractStatus(contractDateFromYmd("2026-10-07"), now).state === "EXPIRED");
  await check("ภายใน 60 วัน = ใกล้หมด, เกิน 60 วัน = ปกติ, ไม่ระบุ = NONE", () =>
    contractStatus(contractDateFromYmd("2026-12-07"), now).state === "SOON" &&
    contractStatus(contractDateFromYmd("2026-12-08"), now).state === "OK" &&
    contractStatus(null, now).state === "NONE");

  console.log("\nค้นหา / กรอง / ส่งออก");
  const v = (o: Partial<CustomerView>): CustomerView => ({
    id: "x", slug: "suansuay", name: "หมู่บ้านสวนสวย", mode: "VILLAGE", modeLabel: "หมู่บ้าน", status: "ACTIVE", accessLabel: "", canCheckIn: true, onboarded: true,
    contactEmail: "a@b.co", pointLimit: 2, activePoints: 1, houseLimit: 100, activeHouses: 80, isVillage: true, contractEndYmd: "2026-11-01", contractEndText: "1 พ.ย. 2569",
    contractState: "SOON", contractDaysLeft: 24, contractLabel: "เหลือ 24 วัน",
    billing: { legalName: "นิติบุคคลสวนสวย", taxId: "0105556000009", branch: "สำนักงานใหญ่", address: "x", billingEmail: "a@b.co" },
    admins: ["admin"], sites: 1, createdText: "", lastVisitText: null, isPlatform: false, ...o,
  });
  const a1 = v({});
  const b1 = v({ id: "y", slug: "acme", name: "บจก. แอคมี", mode: "OFFICE", isVillage: false, contractState: "OK", billing: null });
  await check("ค้นด้วยชื่อ/รหัส/ชื่อผู้ซื้อ/เลขภาษีบางส่วน", () =>
    matchCustomer(a1, { ...EMPTY_FILTER, q: "สวนสวย" }) && matchCustomer(a1, { ...EMPTY_FILTER, q: "SUANSUAY" }) &&
    matchCustomer(a1, { ...EMPTY_FILTER, q: "5556000" }) && !matchCustomer(b1, { ...EMPTY_FILTER, q: "สวนสวย" }));
  await check("กรองประเภท / ต้องต่อสัญญา / ไม่มีใบกำกับภาษี", () =>
    !matchCustomer(a1, { ...EMPTY_FILTER, mode: "OFFICE" }) && matchCustomer(a1, { ...EMPTY_FILTER, contract: "DUE" }) &&
    !matchCustomer(b1, { ...EMPTY_FILTER, contract: "DUE" }) && matchCustomer(b1, { ...EMPTY_FILTER, contract: "NOTAX" }));
  await check("ค่าตัวกรองแปลก ๆ จาก URL ถูกละเลย", () => {
    const f = parseCustomerFilter({ mode: "SHOP", status: "ACTIVE", contract: "x" });
    return f.mode === "" && f.status === "ACTIVE" && f.contract === "";
  });
  await check("ไฟล์ Excel: มี BOM หัวตารางไทย เลขภาษีมีขีด (ไม่หาย 0 นำหน้า) และกันสูตร", () => {
    const csv = customersCsv([a1, v({ name: "=HYPERLINK(1)" })]);
    return csv.startsWith("\uFEFFชื่อลูกค้า") && csv.includes("0-1055-56000-00-9") && csv.includes("'=HYPERLINK") && csv.includes("2026-11-01");
  });

  console.log("\nตรวจข้อมูลลูกค้า");
  await check("รหัสองค์กรผิดรูปแบบ / คำสงวน → ไม่ผ่าน", async () =>
    (await rejects(createCustomer({ ...base, slug: "AB" }, deps), "รหัสองค์กร")) && (await rejects(createCustomer({ ...base, slug: "admin" }, deps), "สงวน")));
  await check("ไม่เลือกประเภทธุรกิจ → ไม่ผ่าน", () => rejects(createCustomer({ ...base, mode: "SHOP" }, deps), "ประเภท"));
  await check("ทดลองใช้เกิน 365 วัน → ไม่ผ่าน", () => rejects(createCustomer({ ...base, trialDays: 400 }, deps), "365"));
  await check("อีเมลผิด → ไม่ผ่าน", () => rejects(createCustomer({ ...base, contactEmail: "x@" }, deps), "อีเมล"));
  await check("ไม่กรอกอีเมลติดต่อ → ไม่ผ่าน (ใช้รับใบกำกับภาษี)", () => rejects(createCustomer({ ...base, contactEmail: "" }, deps), "อีเมล"));
  await check("จำนวนจุด 0 หรือทศนิยม → ไม่ผ่าน", async () =>
    (await rejects(createCustomer({ ...base, pointLimit: 0 }, deps), "จุด")) && (await rejects(createCustomer({ ...base, pointLimit: 1.5 }, deps), "จุด")));
  await check("เลขผู้เสียภาษีผิด checksum → ไม่ผ่าน", () => rejects(createCustomer({ ...base, taxId: "0105556000001" }, deps), "ผู้เสียภาษี"));
  await check("ไม่กรอกที่อยู่ใบกำกับภาษี → ไม่ผ่าน", () => rejects(createCustomer({ ...base, address: "" }, deps), "ที่อยู่"));
  await check("เลขที่สาขาไม่ใช่ตัวเลข → ไม่ผ่าน", () => rejects(createCustomer({ ...base, branch: "สาขาบางนา" }, deps), "สาขา"));
  await check("วันสิ้นสุดสัญญาผิดรูปแบบ → ไม่ผ่าน", () => rejects(createCustomer({ ...base, contractEndsAt: "31/12/2569" }, deps), "วันสิ้นสุดสัญญา"));
  await check("หมู่บ้านไม่กำหนดจำนวนบ้าน → ไม่ผ่าน", () => rejects(createCustomer({ ...base, houseLimit: null }, deps), "จำนวนบ้าน"));
  await check("รหัสองค์กรซ้ำ (main) → ไม่ผ่าน", () => rejects(createCustomer({ ...base, slug: "main" }, deps), "ถูกใช้แล้ว"));

  console.log("\nสร้างลูกค้า → ผู้ดูแลลูกค้า login ครั้งแรก");
  const c = await createCustomer(base, deps);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: c.orgId } });
  await check("องค์กรใหม่: โหมดหมู่บ้าน ทดลองใช้ 30 วัน ยังไม่ตั้งค่าเริ่มต้น", () => {
    const days = (org.trialEndsAt!.getTime() - Date.now()) / 86_400_000;
    return org.siteMode === "VILLAGE" && org.status === "TRIAL" && days > 29 && days <= 30 && !org.onboardedAt && org.contactEmail === "juristic@example.com";
  });
  await check("บันทึกจำนวนจุดตามสัญญา + ข้อมูลใบกำกับภาษี (เลขภาษีเก็บเฉพาะตัวเลข)", async () => {
    const p = await prisma.billingProfile.findUnique({ where: { organizationId: c.orgId } });
    return org.checkInPointLimit === 3 && org.houseLimit === 3 && contractYmd(org.contractEndsAt!) === "2027-09-30" && !!p && p.taxId === "0105556000009" && p.branch === "สำนักงานใหญ่" && p.billingEmail === "juristic@example.com";
  });
  await check("รหัสชั่วคราวใช้ login ได้ และบังคับเปลี่ยนรหัส + onboarding", async () => {
    const me = await login(SLUG, "admin", c.tempPassword, authDeps);
    return me.mustChangePassword && me.needsOnboarding;
  });
  const first = await login(SLUG, "admin", c.tempPassword, authDeps);
  await check("login ครั้งแรก (ต้องตั้งรหัส + ตั้งค่าเริ่มต้น) → ไปหน้าตั้งรหัสได้ ไม่วนซ้ำ", () =>
    landOn(first, "/check-in") === "/account/password" && landOn(first, "/onboarding") === "/account/password" && landOn(first, "/account/password") === "/account/password");
  await changeOwnPassword(first, { current: c.tempPassword, next: "Onsite2026ok", confirm: "Onsite2026ok" }, "no-session", authDeps);
  const me = await login(SLUG, "admin", "Onsite2026ok", authDeps);
  await check("ตั้งรหัสใหม่แล้ว login ได้", () => !me.mustChangePassword && me.organizationId === c.orgId);
  await check("ตั้งรหัสแล้ว → ทุกหน้าพาไปตั้งค่าเริ่มต้น", () =>
    landOn(me, "/check-in") === "/onboarding" && landOn(me, "/account/password") === "/onboarding");

  console.log("\nตั้งค่าเริ่มต้น (onboarding)");
  const od = onboardingDeps(me.organizationId);
  await check("ยังไม่มีสถานที่ → จบไม่ได้", () => rejects(finishOnboarding(me, od), "สถานที่"));
  const siteId = await createFirstSite(me, { name: "หมู่บ้านทดสอบ", mode: "FACTORY", maxStayHours: null }, od);
  const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
  await check("ใช้โหมดที่ผู้ให้บริการกำหนด (ส่งโหมดอื่นมาก็ไม่เปลี่ยน) + ไม่จำกัดเวลา", () => site.mode === "VILLAGE" && site.defaultMaxStayMinutes === null);
  await check("สร้างสถานที่ซ้ำ → ไม่สร้างเพิ่ม", async () => (await createFirstSite(me, { name: "อีกที่", mode: "VILLAGE", maxStayHours: 4 }, od)) === siteId);
  await check("ยังไม่มีบ้าน → จบไม่ได้", () => rejects(finishOnboarding(me, od), "บ้าน"));
  await check("ตั้งค่าเริ่มต้น: วางบ้านเกินสัญญา (4 หลัง / สัญญา 3) → ไม่ผ่าน", () =>
    rejects(addDirectory(me, { tenants: "1/1\n1/2\n1/3\n1/4", hosts: "", bays: "" }, od), "3 หลัง"));
  const added = await addDirectory(me, { tenants: "99/1, 1\n99/2\t1", hosts: "สมชาย ใจดี, 99/1", bays: "" }, od);
  await check("วางรายชื่อจาก Excel → บ้าน 2 ลูกบ้าน 1 (ผูกบ้านถูก)", async () =>
    added.tenants === 2 && added.hosts === 1 && (await db(me.organizationId).host.findFirstOrThrow({ include: { tenant: true } })).tenant?.name === "99/1");
  await finishOnboarding(me, od);
  await check("จบ onboarding → login ครั้งถัดไปเข้าใช้งานได้เลย", async () => {
    const u = await login(SLUG, "admin", "Onsite2026ok", authDeps);
    return !u.needsOnboarding && landOn(u, "/check-in") === "/check-in";
  });

  console.log("\nจำนวนบ้านตามสัญญา (3 หลัง, มีแล้ว 2)");
  const dd = directoryAdminDeps(me.organizationId);
  await saveUnit(me, siteId, null, { name: "99/3", floor: "1" }, dd);
  await check("เพิ่มบ้านหลังที่ 3 ได้", async () => (await dd.repo.houseQuota()).used === 3);
  await check("เพิ่มหลังที่ 4 → ไม่ผ่าน (ครบตามสัญญา)", () => rejects(saveUnit(me, siteId, null, { name: "99/4", floor: "1" }, dd), "ครบจำนวนบ้าน"));
  await check("นำเข้าจาก Excel ที่มีบ้านใหม่ → ไม่ผ่าน", () => rejects(importDirectory(me, siteId, { tenants: "99/1\n99/9", hosts: "", bays: "" }, dd), "ครบจำนวนบ้าน"));
  await check("นำเข้าเฉพาะลูกบ้าน (บ้านเดิม) → ได้", async () =>
    (await importDirectory(me, siteId, { tenants: "99/1", hosts: "สมหญิง ใจดี, 99/2", bays: "" }, dd)).people === 1);
  const house2 = (await dd.repo.units(siteId)).find((u) => u.name === "99/2")!;
  await setUnitActive(me, house2.id, false, dd);
  await check("ปิดใช้งาน 1 หลัง → เพิ่มบ้านใหม่ได้", async () => !!(await saveUnit(me, siteId, null, { name: "99/4", floor: "1" }, dd)));
  await check("เปิดใช้งานบ้านเดิมอีกครั้งตอนเต็ม → ไม่ผ่าน", () => rejects(setUnitActive(me, house2.id, true, dd), "ครบจำนวนบ้าน"));
  await updateCustomerContract(c.orgId, { ...base, houseLimit: 10 }, deps);
  await check("ผู้ให้บริการเพิ่มสัญญาเป็น 10 หลัง → เปิดใช้งานได้", async () => {
    await setUnitActive(me, house2.id, true, dd);
    const q = await dd.repo.houseQuota();
    return q.limit === 10 && q.used === 4;
  });

  console.log("\nจัดการลูกค้า");
  await suspendCustomer(c.orgId, SLUG, deps);
  await check("ระงับ → ผู้ใช้ของลูกค้า login ไม่ได้", () => rejects(login(SLUG, "admin", "Onsite2026ok", authDeps), "ระงับ"));
  await resumeCustomer(c.orgId, deps);
  await check("ยกเลิกการระงับ → กลับเป็นทดลองใช้ และ login ได้", async () =>
    (await prisma.organization.findUniqueOrThrow({ where: { id: c.orgId } })).status === "TRIAL" && !!(await login(SLUG, "admin", "Onsite2026ok", authDeps)));
  await check("ระงับองค์กรของผู้ให้บริการไม่ได้", async () => {
    const main = await prisma.organization.findUniqueOrThrow({ where: { slug: deps.platformOrgSlug } });
    return rejects(suspendCustomer(main.id, main.slug, deps), "ผู้ให้บริการ");
  });
  const reset = await resetCustomerAdmin(c.orgId, "admin", deps);
  await check("รีเซ็ตรหัสผู้ดูแล → รหัสเดิมใช้ไม่ได้ รหัสใหม่ต้องเปลี่ยนก่อนใช้", async () =>
    (await rejects(login(SLUG, "admin", "Onsite2026ok", authDeps))) && (await login(SLUG, "admin", reset.tempPassword, authDeps)).mustChangePassword);
  await check("รีเซ็ตผู้ใช้ที่ไม่ใช่ผู้ดูแล/ไม่มีอยู่ → ไม่ผ่าน", () => rejects(resetCustomerAdmin(c.orgId, "ghost", deps), "ไม่พบ"));

  console.log("\nแยกองค์กร");
  const c2 = await createCustomer({ ...base, slug: SLUG2, mode: "OFFICE", plan: "ACTIVE" }, deps);
  await check("ลูกค้าอีกรายใช้ชื่อผู้ใช้ admin ซ้ำได้ + ใช้งานจริงไม่มีวันหมดอายุ", async () => {
    const o = await prisma.organization.findUniqueOrThrow({ where: { id: c2.orgId } });
    return o.status === "ACTIVE" && !o.trialEndsAt && !o.paidUntil && o.siteMode === "OFFICE" && o.houseLimit === null;
  });
  await check("รหัสของลูกค้า A ใช้กับลูกค้า B ไม่ได้", () => rejects(login(SLUG2, "admin", reset.tempPassword, authDeps)));
  await check("รายการลูกค้าแสดงทั้งสองราย พร้อมผู้ดูแล จำนวนจุด และข้อมูลใบกำกับภาษี", async () => {
    const list = await deps.repo.list();
    const a = list.find((x) => x.slug === SLUG);
    return !!a && !!list.find((x) => x.slug === SLUG2) && a.admins.includes("admin") && a.sites === 1 && a.mode === "VILLAGE" && a.pointLimit === 3 && a.activePoints === 0 && a.houseLimit === 10 && a.activeHouses === 4 && a.billing?.legalName === "นิติบุคคลหมู่บ้านทดสอบ";
  });

  console.log("\nแก้ไขสัญญา");
  await updateCustomerContract(c.orgId, { ...base, pointLimit: 5, taxId: "0994000160003", branch: "12", legalName: "บจก. ทดสอบ" }, deps);
  await check("เพิ่มจุดเป็น 5 + เปลี่ยนเป็นสาขาที่ 00012", async () => {
    const o = await prisma.organization.findUniqueOrThrow({ where: { id: c.orgId }, include: { billingProfile: true } });
    return o.checkInPointLimit === 5 && o.billingProfile?.branch === "สาขาที่ 00012" && o.billingProfile.taxId === "0994000160003" && o.billingProfile.legalName === "บจก. ทดสอบ";
  });
  await check("แก้ไขด้วยข้อมูลผิด → ไม่ผ่าน และข้อมูลเดิมไม่เปลี่ยน", async () => {
    const bad = await rejects(updateCustomerContract(c.orgId, { ...base, pointLimit: 1000 }, deps), "จุด");
    const o = await prisma.organization.findUniqueOrThrow({ where: { id: c.orgId } });
    return bad && o.checkInPointLimit === 5;
  });
  await check("ลูกค้าที่ไม่มีอยู่ → ไม่ผ่าน", () => rejects(updateCustomerContract("nope", base, deps), "ไม่พบ"));
  await check("ต่อสัญญา: เปลี่ยนวันสิ้นสุด และนับเป็น 'ต้องต่อสัญญา' เมื่อใกล้ครบ", async () => {
    const before = await deps.repo.renewalsDue(contractDateFromYmd("2027-12-31")!, deps.platformOrgSlug);
    await updateCustomerContract(c.orgId, { ...base, houseLimit: 10, contractEndsAt: "2028-09-30" }, deps);
    const after = await deps.repo.renewalsDue(contractDateFromYmd("2027-12-31")!, deps.platformOrgSlug);
    const o = await prisma.organization.findUniqueOrThrow({ where: { id: c.orgId } });
    return contractYmd(o.contractEndsAt!) === "2028-09-30" && after === before - 1;
  });
  await check("ล้างวันสิ้นสุดสัญญาได้ (ไม่ระบุ)", async () => {
    await updateCustomerContract(c.orgId, { ...base, houseLimit: 10, contractEndsAt: "" }, deps);
    return (await prisma.organization.findUniqueOrThrow({ where: { id: c.orgId } })).contractEndsAt === null;
  });

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
