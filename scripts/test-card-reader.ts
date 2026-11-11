/**
 * ทดสอบการอ่านบัตรประชาชนผ่านเครื่องอ่านบัตร (ใช้บัตรจำลอง — ไม่ต้องมีฮาร์ดแวร์)
 *   npm run test:cardreader
 *  1) ถอดรหัสข้อมูลในชิป (TIS-620, ชื่อ, วันที่ พ.ศ., ที่อยู่, รูป)
 *  2) ลำดับคำสั่ง APDU กับบัตรจำลอง
 *  3) โปรแกรมเชื่อมเครื่องอ่านบัตร: ความปลอดภัย (Origin/Host) และส่งข้อมูลให้หน้าเว็บ
 */
import { request } from "node:http";
import sharp from "sharp";
import {
  decodeTis620,
  displayName,
  getResponseP2,
  isCardExpired,
  parseCardAddress,
  parseCardDate,
  parseCardName,
  readThaiIdCard,
  SmartCardError,
} from "@/domain/idcard/thai-smartcard";
import { fakeCardTransmit, SAMPLE_CARD } from "@/infrastructure/card-agent/fake-card";
import { startCardAgent } from "@/infrastructure/card-agent/server";
import { simulatedSource } from "@/infrastructure/card-agent/sources";

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
const rejects = (p: Promise<unknown>, contains: string) =>
  p.then(
    () => false,
    (e: Error) => e instanceof SmartCardError && e.message.includes(contains),
  );

const ORIGIN = "http://localhost:3000";

function http(port: number, path: string, headers: Record<string, string> = {}, method = "GET") {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

/** เปิด SSE แล้วเก็บ event ที่ได้ */
function sse(port: number, origin: string) {
  const events: { event: string; data: unknown }[] = [];
  let buf = "";
  const req = request({ host: "127.0.0.1", port, path: "/v1/events", headers: { Origin: origin, Accept: "text/event-stream" } }, (res) => {
    res.setEncoding("utf8");
    res.on("data", (chunk: string) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (ev && data) events.push({ event: ev, data: JSON.parse(data) });
      }
    });
  });
  req.end();
  return { events, close: () => req.destroy() };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("\nถอดรหัสข้อมูลในชิป");
  await check("TIS-620 → ภาษาไทย (ตัดช่องว่าง/0x00 ท้าย)", () => decodeTis620(Uint8Array.of(0xc1, 0xd2, 0xb9, 0xd0, 0x20, 0x00)) === "มานะ");
  await check("ชื่อ 'นาย#มานะ##รักเรียน' → แยกคำนำหน้า/ชื่อ/สกุล", () => {
    const n = parseCardName("นาย#มานะ##รักเรียน");
    return n.prefix === "นาย" && n.first === "มานะ" && n.middle === "" && n.last === "รักเรียน" && displayName(n) === "มานะ รักเรียน";
  });
  await check("วันที่ พ.ศ. → ค.ศ. · วัน/เดือนไม่ทราบ (00) = null", () =>
    parseCardDate("25350115") === "1992-01-15" && parseCardDate("25350000") === null && parseCardDate("") === null);
  await check("ที่อยู่: ตัด # และช่องว่าง", () => parseCardAddress("99/9#หมู่ที่ 1####ตำบลทดสอบ#อำเภอเมือง") === "99/9 หมู่ที่ 1 ตำบลทดสอบ อำเภอเมือง");
  await check("บัตรรุ่น ATR 3B 67 ใช้ GET RESPONSE แบบ P2=01", () => getResponseP2(Uint8Array.of(0x3b, 0x67, 0x00)) === 1 && getResponseP2(Uint8Array.of(0x3b, 0x68)) === 0);
  await check("ตรวจบัตรหมดอายุ", () => isCardExpired("2026-10-07", "2026-10-08") && !isCardExpired("2026-10-08", "2026-10-08") && !isCardExpired(null, "2026-10-08"));

  console.log("\nอ่านบัตรจำลอง (ลำดับ APDU เหมือนบัตรจริง)");
  const jpeg = new Uint8Array(await sharp({ create: { width: 60, height: 75, channels: 3, background: "#88aacc" } }).jpeg().toBuffer());
  const d = await readThaiIdCard(fakeCardTransmit({ ...SAMPLE_CARD, photo: jpeg }), { photo: true });
  await check("เลขบัตร ชื่อไทย/อังกฤษ เพศ วันเกิด วันหมดอายุ ที่อยู่", () =>
    d.cid === "0999999999991" &&
    displayName(d.thName) === "มานะ รักเรียน" &&
    displayName(d.enName) === "Mana Rakrian" &&
    d.gender === "M" &&
    d.birthDate === "1992-01-15" &&
    d.expireDate === "2031-01-14" &&
    d.address.startsWith("99/9 หมู่ที่ 1"));
  await check("รูปจากชิป: ได้ JPEG ครบ (ตัดส่วนเกินท้ายไฟล์)", () => !!d.photo && d.photo.length === jpeg.length && d.photo[0] === 0xff && d.photo.at(-1) === 0xd9);
  await check("ไม่ขอรูป → ไม่อ่านรูป", async () => (await readThaiIdCard(fakeCardTransmit(SAMPLE_CARD))).photo === null);
  await check("ไม่ใช่บัตรประชาชน → แจ้งชัดเจน", () => rejects(readThaiIdCard(fakeCardTransmit(SAMPLE_CARD, { notThaiId: true })), "ไม่ใช่บัตรประชาชนไทย"));
  await check("เลขบัตรในชิปผิด checksum (อ่านไม่สมบูรณ์) → ให้เสียบใหม่", () =>
    rejects(readThaiIdCard(fakeCardTransmit({ ...SAMPLE_CARD, cid: "0999999999990" })), "เสียบบัตรใหม่"));

  console.log("\nโปรแกรมเชื่อมเครื่องอ่านบัตร");
  const sim = simulatedSource({ ...SAMPLE_CARD, photo: jpeg });
  const agent = await startCardAgent({ port: 0, origins: [ORIGIN], source: sim });
  try {
    const port = agent.port;
    await check("ฟังเฉพาะ 127.0.0.1", () => {
      const a = agent.server.address();
      return typeof a === "object" && a?.address === "127.0.0.1";
    });
    await check("เปิดสถานะตรง ๆ ได้ (ไม่มีข้อมูลบัตร)", async () => {
      const r = await http(port, "/v1/status");
      const s = JSON.parse(r.body);
      return r.status === 200 && s.reader?.includes("จำลอง") && s.card === "absent" && !("cid" in s);
    });
    await check("เว็บอื่นที่ไม่ได้รับอนุญาต → ปฏิเสธ (403)", async () => (await http(port, "/v1/events", { Origin: "https://evil.example" })).status === 403);
    await check("Host ปลอม (DNS rebinding) → ปฏิเสธ", async () => (await http(port, "/v1/status", { Host: "evil.example:47800", Origin: ORIGIN })).status === 421);
    await check("Preflight จากเว็บที่อนุญาต → อนุญาต Private Network", async () => {
      const r = await http(port, "/v1/events", { Origin: ORIGIN, "Access-Control-Request-Private-Network": "true" }, "OPTIONS");
      return r.status === 204 && r.headers["access-control-allow-private-network"] === "true" && r.headers["access-control-allow-origin"] === ORIGIN;
    });

    const a = sse(port, ORIGIN);
    await wait(150);
    await sim.insert();
    await wait(150);
    const card = a.events.find((e) => e.event === "card")?.data as Record<string, string> | undefined;
    await check("เสียบบัตร → หน้าเว็บได้ชื่อ เลขบัตร และรูป (data URL)", () =>
      !!card && card.fullName === "มานะ รักเรียน" && card.cid === "0999999999991" && card.prefix === "นาย" && card.photo.startsWith("data:image/jpeg;base64,"));
    await check("ไม่ส่งที่อยู่/วันเกิด/เพศ (ส่งเท่าที่จำเป็น)", () => !!card && !("address" in card) && !("birthDate" in card) && !("gender" in card));
    await check("สถานะเปลี่ยนเป็น 'กำลังอ่าน' แล้ว 'มีบัตร'", () => {
      const st = a.events.filter((e) => e.event === "status").map((e) => (e.data as { card: string }).card);
      return st.includes("reading") && st.at(-1) === "present";
    });

    const b = sse(port, ORIGIN);
    await wait(150);
    await check("หน้าจอที่เปิดทีหลัง (บัตรยังเสียบอยู่) ได้ข้อมูลทันที", () => b.events.some((e) => e.event === "card"));
    sim.remove();
    await wait(100);
    await check("ถอดบัตร → ล้างข้อมูล (หน้าจอใหม่ไม่ได้ข้อมูลบัตรเดิม)", async () => {
      const c = sse(port, ORIGIN);
      await wait(150);
      c.close();
      return !c.events.some((e) => e.event === "card") && (c.events[0]?.data as { card: string }).card === "absent";
    });
    await sim.insert(SAMPLE_CARD, { notThaiId: true });
    await wait(100);
    await check("เสียบบัตรอื่นที่ไม่ใช่บัตรประชาชน → ส่งข้อความ error", () =>
      a.events.some((e) => e.event === "error" && String((e.data as { message: string }).message).includes("ไม่ใช่บัตรประชาชน")));
    a.close();
    b.close();
  } finally {
    await agent.close();
  }

  console.log(`\nผล: ผ่าน ${passed} / ${passed + failed}${failed ? `  —  ไม่ผ่าน ${failed}` : ""}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
