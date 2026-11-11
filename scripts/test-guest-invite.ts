/**
 * ทดสอบ: แจ้งแขกล่วงหน้า (ลูกบ้านสร้าง QR → แขกแสดง QR → รปภ. Check-in → แจ้ง LINE สมาชิกในบ้าน)
 *   npm run test:invite
 * สร้างองค์กรทดสอบ 2 แห่ง แล้วลบทิ้งเมื่อจบ (ข้อมูลสมมติทั้งหมด)
 */
import "dotenv/config";
import { checkInSchema, formDataToCheckInPayload } from "@/application/check-in/check-in.schema";
import { checkInVisitor, type CheckInDeps } from "@/application/check-in/check-in.usecase";
import {
  cancelGuestInvite,
  createGuestInvite,
  guestPass,
  LINK_EXPIRED,
  listInvitesForCheckIn,
  lookupInviteForCheckIn,
  residentPage,
} from "@/application/guest-invite/guest-invite.usecase";
import { handleLineEvents, isInviteKeyword } from "@/application/host-line/host-line.usecase";
import type { GuestArrivedMessage, HostContact } from "@/application/ports";
import { checkInDeps, hostLineWebhookDeps, residentInviteDeps, staffInviteDeps } from "@/container";
import {
  extractInviteToken,
  inviteState,
  inviteWindowText,
  parseBangkokLocal,
  toBangkokLocal,
  validateInviteInput,
} from "@/domain/invite/guest-invite";
import { prisma } from "@/infrastructure/db/prisma";
import { prismaRetentionRepository } from "@/infrastructure/repositories/prisma-retention.repository";
import { createResidentToken, verifyResidentToken } from "@/infrastructure/security/resident-token";

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

const SLUGS = ["t-inv-a", "t-inv-b"];
const H = 3600_000;

async function cleanup() {
  const ids = (await prisma.organization.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } })).map((o) => o.id);
  if (!ids.length) return;
  const where = { organizationId: { in: ids } };
  await prisma.guestInvite.deleteMany({ where });
  await prisma.visitEvent.deleteMany({ where });
  await prisma.vehicleInfo.deleteMany({ where });
  await prisma.visit.deleteMany({ where });
  await prisma.visitor.deleteMany({ where });
  await prisma.host.deleteMany({ where });
  await prisma.tenant.deleteMany({ where });
  await prisma.site.deleteMany({ where });
  await prisma.dataPurgeLog.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ idType: "OTHER", idNumber: "AB1234", pdpaConsent: "on", purpose: "GUEST", ...fields })) fd.set(k, v);
  return checkInSchema.parse(formDataToCheckInPayload(fd));
}

async function main() {
  await cleanup();
  const now = new Date();

  console.log("\nกฎของการแจ้งแขก (domain)");
  await check("เวลาไทย: '2026-11-10T14:30' = 07:30Z และแปลงกลับได้ · วันที่ไม่มีจริง = null", () => {
    const d = parseBangkokLocal("2026-11-10T14:30");
    return d?.toISOString() === "2026-11-10T07:30:00.000Z" && toBangkokLocal(d) === "2026-11-10T14:30" && parseBangkokLocal("2026-02-31T10:00") === null;
  });
  await check("ช่วงเวลา: สิ้นสุดก่อนเริ่ม / ผ่านไปแล้ว / เกิน 7 วัน / ล่วงหน้าเกิน 60 วัน → ไม่ผ่าน", () => {
    const at = (h: number) => toBangkokLocal(new Date(now.getTime() + h * H));
    const e1 = validateInviteInput({ validFrom: at(2), validUntil: at(1) }, now);
    const e2 = validateInviteInput({ validFrom: at(-5), validUntil: at(-1) }, now);
    const e3 = validateInviteInput({ validFrom: at(1), validUntil: at(1 + 8 * 24) }, now);
    const e4 = validateInviteInput({ validFrom: at(61 * 24), validUntil: at(61 * 24 + 2) }, now);
    return !e1.ok && !!e1.errors.validUntil && !e2.ok && !!e2.errors.validUntil && !e3.ok && !!e3.errors.validUntil && !e4.ok && !!e4.errors.validFrom;
  });
  await check("ทะเบียนรถ: จัดรูปแบบ / ไม่มีตัวเลข = ผิด · ไม่บังคับชื่อและทะเบียน", () => {
    const at = (h: number) => toBangkokLocal(new Date(now.getTime() + h * H));
    const ok = validateInviteInput({ validFrom: at(0), validUntil: at(3), plateNumber: "  1กข   1234 ", guestName: "" }, now);
    const bad = validateInviteInput({ validFrom: at(0), validUntil: at(3), plateNumber: "ไม่ทราบ" }, now);
    const none = validateInviteInput({ validFrom: at(0), validUntil: at(3) }, now);
    return ok.ok && ok.value.plateNumber === "1กข 1234" && ok.value.guestName === null && !bad.ok && !!bad.errors.plateNumber && none.ok;
  });
  await check("สถานะ: มาก่อนเวลาได้ 60 นาที · หลังสิ้นสุด = หมดเวลา · ใช้แล้ว/ยกเลิก", () => {
    const i = { status: "ACTIVE" as const, validFrom: new Date(now.getTime() + 2 * H), validUntil: new Date(now.getTime() + 5 * H) };
    return (
      inviteState(i, now) === "NOT_YET" &&
      inviteState(i, new Date(now.getTime() + 1.1 * H)) === "OPEN" &&
      inviteState(i, new Date(now.getTime() + 5.1 * H)) === "EXPIRED" &&
      inviteState({ ...i, status: "USED" }, now) === "USED" &&
      inviteState({ ...i, status: "CANCELLED" }, now) === "CANCELLED"
    );
  });
  await check("ข้อความช่วงเวลา: วันเดียว / ข้ามวัน", () => {
    const a = inviteWindowText(new Date("2026-11-10T07:00:00Z"), new Date("2026-11-10T11:00:00Z"));
    const b = inviteWindowText(new Date("2026-11-10T07:00:00Z"), new Date("2026-11-11T03:00:00Z"));
    return a.includes("14:00–18:00") && b.includes("–") && b.includes("11");
  });
  await check("อ่าน QR: ลิงก์ (โดเมนใดก็ได้) / token ล้วน / ข้อความอื่น", () =>
    extractInviteToken("https://old-tunnel.trycloudflare.com/g/AbCdEfGhIjKlMnOpQrStUvWx") === "AbCdEfGhIjKlMnOpQrStUvWx" &&
    extractInviteToken("AbCdEfGhIjKlMnOpQrStUvWx") === "AbCdEfGhIjKlMnOpQrStUvWx" &&
    extractInviteToken("VMS1.abc.def") === null &&
    extractInviteToken("https://x.com/g/short") === null);
  await check("คำสั่งใน LINE: แจ้งแขก / เชิญแขก / แขก / invite · ข้อความอื่นไม่ใช่", () =>
    ["แจ้งแขก", "เชิญแขก", " แขก ", "แจ้งแขกล่วงหน้า", "Invite"].every(isInviteKeyword) && !isInviteKeyword("123456") && !isInviteKeyword("แขกมากี่คน"));

  console.log("\nลิงก์ของลูกบ้าน (เซ็นแล้ว)");
  const tok = createResidentToken("host1", "Uabc", new Date(now.getTime() + H));
  await check("ลิงก์ถูกต้อง → อ่านได้ · หมดอายุ / แก้ไข / ต่อท้าย → ใช้ไม่ได้", () => {
    const [p, body, sig] = tok.split(".");
    const forged = Buffer.from(JSON.stringify({ h: "host2", u: "x", exp: 9e9 })).toString("base64url");
    return (
      verifyResidentToken(tok, now)?.h === "host1" &&
      verifyResidentToken(tok, new Date(now.getTime() + 2 * H)) === null &&
      verifyResidentToken(`${p}.${forged}.${sig}`, now) === null &&
      verifyResidentToken(`${tok}.x`, now) === null &&
      verifyResidentToken(`${p}.${body}.${sig.slice(0, -1)}A`, now) === null
    );
  });

  // ---------------- ข้อมูลทดสอบ ----------------
  const A = await prisma.organization.create({ data: { slug: SLUGS[0], name: "หมู่บ้านทดสอบ", status: "TRIAL", siteMode: "VILLAGE", onboardedAt: now } });
  const B = await prisma.organization.create({ data: { slug: SLUGS[1], name: "หมู่บ้าน B", status: "TRIAL", siteMode: "VILLAGE", onboardedAt: now } });
  const site = await prisma.site.create({ data: { organizationId: A.id, code: "V1", name: "หมู่บ้านสวนสวย", mode: "VILLAGE" } });
  const house = await prisma.tenant.create({ data: { organizationId: A.id, siteId: site.id, name: "99/1", floor: "2" } });
  const mk = (fullName: string, lineUserId: string | null) =>
    prisma.host.create({ data: { organizationId: A.id, siteId: site.id, tenantId: house.id, fullName, lineUserId, lineLinkedAt: lineUserId ? now : null } });
  const dad = await mk("สมชาย ทดสอบ", "Utest-dad");
  const mom = await mk("สมหญิง ทดสอบ", "Utest-mom");
  await mk("น้องเล็ก ทดสอบ", null); // ยังไม่เชื่อม LINE
  const bSite = await prisma.site.create({ data: { organizationId: B.id, code: "V1", name: "B", mode: "VILLAGE" } });
  await prisma.host.create({ data: { organizationId: B.id, siteId: bSite.id, fullName: "คนนอก", lineUserId: "Utest-other" } });

  const rd = residentInviteDeps();
  const link = (hostId: string, uid: string) => createResidentToken(hostId, uid, new Date(now.getTime() + H));
  const dadLink = link(dad.id, "Utest-dad");

  console.log("\nลูกบ้านแจ้งแขก");
  await check("เปิดหน้าแจ้งแขก: เห็นบ้านและชื่อตัวเอง", async () => {
    const v = await residentPage(dadLink, rd);
    return v.placeText === "บ้าน 99/1 · ซอย 2" && v.hostName === "สมชาย ทดสอบ" && v.invites.length === 0 && !!parseBangkokLocal(v.defaults.validFrom);
  });
  await check("ลิงก์ของบัญชี LINE อื่น (ถูกย้ายการเชื่อมต่อ) → ใช้ไม่ได้", () => rejects(residentPage(link(dad.id, "Utest-mom"), rd), "หมดอายุ"));
  await check("ลิงก์มั่ว → ใช้ไม่ได้", () => rejects(residentPage("MANAR1.xx.yy", rd), LINK_EXPIRED.slice(0, 10)));

  const at = (h: number) => toBangkokLocal(new Date(now.getTime() + h * H));
  const bad = await createGuestInvite(dadLink, { validFrom: at(3), validUntil: at(1) }, rd);
  await check("กรอกเวลาผิด → แจ้งที่ช่อง", () => !bad.ok && !!bad.fieldErrors?.validUntil);
  const created = await createGuestInvite(dadLink, { validFrom: at(-0.5), validUntil: at(3), plateNumber: "1กข 1234 กรุงเทพมหานคร", guestName: "แขก ทดสอบ", note: "มา 2 คน" }, rd);
  if (!created.ok) throw new Error(`สร้างไม่สำเร็จ: ${created.error}`);
  const inv = created.invite;
  const token = inv.guestUrl.split("/g/")[1];
  await check("สร้าง QR: ลิงก์ของแขก + ข้อความส่ง LINE มีบ้าน/เวลา/ทะเบียน", () =>
    /^[A-Za-z0-9_-]{24}$/.test(token) && inv.state === "OPEN" && inv.shareText.includes("บ้าน 99/1") && inv.shareText.includes("1กข 1234") && inv.shareText.includes(inv.guestUrl));
  await check("หน้าของแขก: เห็นบ้าน เวลา ทะเบียน · token มั่ว = ไม่พบ", async () => {
    const g = await guestPass(token, rd);
    return g?.placeText === "บ้าน 99/1 · ซอย 2" && g.plateNumber === "1กข 1234 กรุงเทพมหานคร" && g.state === "OPEN" && (await guestPass("x".repeat(24), rd)) === null;
  });

  console.log("\nจุด รปภ.");
  const sa = staffInviteDeps(A.id);
  await check("สแกน QR → ได้บ้าน/ลูกบ้าน/ทะเบียน พร้อม Check-in", async () => {
    const v = await lookupInviteForCheckIn({ token }, sa);
    return v.id === inv.id && v.hostId === dad.id && v.tenantId === house.id && v.problem === null;
  });
  await check("QR ของหมู่บ้านอื่น → ไม่พบ (แยกข้อมูลแต่ละองค์กร)", () => rejects(lookupInviteForCheckIn({ token }, staffInviteDeps(B.id)), "ไม่พบ"));
  await check("รายชื่อแขกวันนี้ของ รปภ.", async () => (await listInvitesForCheckIn(sa)).some((i) => i.id === inv.id) && (await listInvitesForCheckIn(staffInviteDeps(B.id))).length === 0);

  const stampTo: string[] = [];
  const arrived: { to: HostContact; m: GuestArrivedMessage }[] = [];
  const deps = (orgId: string): CheckInDeps => ({
    ...checkInDeps(orgId),
    notifier: {
      sendStampRequest: async (h) => (stampTo.push(h.fullName), { channel: "CONSOLE", ok: true }),
      sendGuestArrived: async (to, m) => (arrived.push({ to, m }), { channel: "CONSOLE", ok: true }),
    },
  });
  const flush = () => new Promise((r) => setTimeout(r, 300));

  // รปภ. เลือกบ้านผิด → ระบบใช้บ้าน/ผู้แจ้งตาม QR
  const other = await prisma.tenant.create({ data: { organizationId: A.id, siteId: site.id, name: "99/9", floor: "2" } });
  const v = await checkInVisitor(
    form({ mode: "VILLAGE", siteId: site.id, tenantId: other.id, fullName: "แขก ทดสอบ", inviteId: inv.id, requireStamp: "on", hasVehicle: "on", plateNumber: "1กข 1234", vehicleType: "CAR" }),
    deps(A.id),
    "guard",
  );
  await flush();
  const visit = await prisma.visit.findUniqueOrThrow({ where: { id: v.visitId } });
  const used = await prisma.guestInvite.findUniqueOrThrow({ where: { id: inv.id } });
  await check("Check-in ด้วย QR: บ้าน/ลูกบ้านตามที่แจ้ง · QR เปลี่ยนเป็น 'มาถึงแล้ว' ผูกกับรายการเข้า", () =>
    visit.tenantId === house.id && visit.hostId === dad.id && used.status === "USED" && used.visitId === visit.id && !!used.usedAt);
  await check("ผู้แจ้งได้ข้อความ E-Stamp · สมาชิกอื่นในบ้านที่เชื่อม LINE ได้ข้อความ 'แขกมาถึง' (ไม่ซ้ำ)", () =>
    stampTo.join() === "สมชาย ทดสอบ" && arrived.length === 1 && arrived[0].to.fullName === "สมหญิง ทดสอบ" && arrived[0].m.invitedBy === "สมชาย ทดสอบ" && arrived[0].m.placeText === "บ้าน 99/1 · ซอย 2");
  await check("บันทึกการแจ้งเตือนในประวัติรายการ", async () =>
    (await prisma.visitEvent.count({ where: { visitId: visit.id, type: "HOST_NOTIFIED" } })) === 2);
  await check("ใช้ QR เดิมซ้ำ → ไม่ได้", () =>
    rejects(checkInVisitor(form({ mode: "VILLAGE", siteId: site.id, tenantId: house.id, inviteId: inv.id }), deps(A.id)), "ใช้ Check-in ไปแล้ว"));
  await check("ลูกบ้านเห็นสถานะ 'มาถึงแล้ว' · ยกเลิกรายการที่ใช้แล้วไม่ได้", async () =>
    (await residentPage(dadLink, rd)).invites[0]?.state === "USED" && (await rejects(cancelGuestInvite(dadLink, inv.id, rd), "ยกเลิกไม่ได้")));

  console.log("\nไม่ขอ E-Stamp / ยกเลิก / หมดเวลา");
  const c2 = await createGuestInvite(dadLink, { validFrom: at(0), validUntil: at(2) }, rd);
  if (!c2.ok) throw new Error(c2.error);
  arrived.length = 0;
  stampTo.length = 0;
  await checkInVisitor(form({ mode: "VILLAGE", siteId: site.id, fullName: "แขกสอง", inviteId: c2.invite.id }), deps(A.id));
  await flush();
  await check("ไม่ขอ E-Stamp → ทุกคนในบ้านที่เชื่อม LINE ได้ 'แขกมาถึง' (รวมผู้แจ้ง) · คนที่ยังไม่เชื่อมไม่ได้", () =>
    stampTo.length === 0 && arrived.map((x) => x.to.fullName).sort().join() === ["สมชาย ทดสอบ", "สมหญิง ทดสอบ"].sort().join());

  const c3 = await createGuestInvite(dadLink, { validFrom: at(0), validUntil: at(2) }, rd);
  if (!c3.ok) throw new Error(c3.error);
  await check("แม่ (คนอื่นในบ้าน) ยกเลิก QR ของพ่อไม่ได้", () => rejects(cancelGuestInvite(link(mom.id, "Utest-mom"), c3.invite.id, rd)));
  await cancelGuestInvite(dadLink, c3.invite.id, rd);
  await check("ยกเลิกแล้ว → Check-in ไม่ได้ · หน้าแขกแสดง 'ยกเลิกแล้ว'", async () =>
    (await rejects(checkInVisitor(form({ mode: "VILLAGE", siteId: site.id, inviteId: c3.invite.id }), deps(A.id)), "ยกเลิก")) &&
    (await guestPass(c3.invite.guestUrl.split("/g/")[1], rd))?.state === "CANCELLED");

  const late = await prisma.guestInvite.create({
    data: { organizationId: A.id, siteId: site.id, tenantId: house.id, hostId: dad.id, token: "late-token-aaaaaaaaaaaaaa", validFrom: new Date(now.getTime() - 5 * H), validUntil: new Date(now.getTime() - H) },
  });
  const early = await prisma.guestInvite.create({
    data: { organizationId: A.id, siteId: site.id, tenantId: house.id, hostId: dad.id, token: "early-token-aaaaaaaaaaaaa", validFrom: new Date(now.getTime() + 3 * H), validUntil: new Date(now.getTime() + 5 * H) },
  });
  await check("หมดเวลา → Check-in ไม่ได้", () => rejects(checkInVisitor(form({ mode: "VILLAGE", siteId: site.id, inviteId: late.id }), deps(A.id)), "หมดเวลา"));
  await check("มาก่อนเวลาเกิน 1 ชม. → Check-in ไม่ได้", () => rejects(checkInVisitor(form({ mode: "VILLAGE", siteId: site.id, inviteId: early.id }), deps(A.id)), "ยังไม่ถึงเวลา"));
  await check("ใช้ QR ของหมู่บ้านอื่นตอน Check-in → ไม่พบ", () =>
    rejects(checkInVisitor(form({ mode: "VILLAGE", siteId: bSite.id, inviteId: early.id }), deps(B.id)), "ไม่พบ"));

  console.log("\nLINE: พิมพ์ “แจ้งแขก”");
  const replies: { kind: string; links?: { label: string; url: string }[] }[] = [];
  const webhook = {
    ...hostLineWebhookDeps,
    line: {
      ...hostLineWebhookDeps.line,
      displayName: async () => null,
      replyInviteLinks: async (_t: string, links: { label: string; url: string }[]) => void replies.push({ kind: "links", links }),
      replyInviteNotLinked: async () => void replies.push({ kind: "notLinked" }),
      replyHelp: async () => void replies.push({ kind: "help" }),
    },
  };
  await handleLineEvents(
    [
      { type: "text", userId: "Utest-mom", replyToken: "r1", text: "แจ้งแขก" },
      { type: "text", userId: "Utest-nobody", replyToken: "r2", text: "แจ้งแขก" },
    ],
    webhook,
  );
  const linkUrl = replies[0]?.links?.[0]?.url ?? "";
  await check("ลูกบ้านที่เชื่อมแล้ว → ได้ปุ่มลิงก์ของตัวเอง (เปิดได้จริง)", async () =>
    replies[0]?.kind === "links" && linkUrl.includes("/r/MANAR1.") && (await residentPage(linkUrl.split("/r/")[1], rd)).hostName === "สมหญิง ทดสอบ");
  await check("บัญชีที่ยังไม่เชื่อม → แนะนำให้เชื่อมต่อก่อน", () => replies[1]?.kind === "notLinked");
  await prisma.host.update({ where: { id: mom.id }, data: { isActive: false } });
  await check("ลูกบ้านที่ถูกปิดใช้งาน → ลิงก์เดิมใช้ไม่ได้ทันที", () => rejects(residentPage(linkUrl.split("/r/")[1], rd), "หมดอายุ"));

  console.log("\nPDPA");
  await prismaRetentionRepository(A.id).anonymizePersonalData(new Date(now.getTime() - 0.5 * H), now);
  await check("ลบรายการแจ้งแขกที่หมดเวลาเกินระยะเก็บข้อมูล (เฉพาะองค์กรนี้)", async () =>
    !(await prisma.guestInvite.findUnique({ where: { id: late.id } })) && !!(await prisma.guestInvite.findUnique({ where: { id: early.id } })));

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
