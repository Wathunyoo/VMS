/**
 * โปรแกรมเชื่อมเครื่องอ่านบัตรประชาชน — รันบนคอมพิวเตอร์ที่ป้อมยาม (เครื่องเดียวกับที่เปิดหน้า Check-in)
 *   npm run card-agent                 ใช้เครื่องอ่านบัตรจริง (PC/SC)
 *   npm run card-agent -- --simulate   ไม่มีเครื่องอ่าน: กด Enter = เสียบ/ถอดบัตรจำลอง
 * ตัวเลือก: --port 47800  --origins "https://mana.example.com,http://localhost:3000"  --no-photo
 * ค่าเริ่มต้น origins: CARD_AGENT_ORIGINS ใน .env หรือ APP_URL + http://localhost:3000
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { startCardAgent } from "@/infrastructure/card-agent/server";
import { pcscSource, simulatedSource } from "@/infrastructure/card-agent/sources";

async function main() {
  const { values } = parseArgs({
    options: {
      simulate: { type: "boolean", default: false },
      port: { type: "string", default: process.env.CARD_AGENT_PORT || "47800" },
      origins: { type: "string" },
      "no-photo": { type: "boolean", default: false },
    },
  });
  const origins = [
    ...new Set(
      (
        values.origins ||
        process.env.CARD_AGENT_ORIGINS ||
        [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL, "http://localhost:3000"].filter(Boolean).join(",")
      )
        .split(",")
        .map((s) => s.trim().replace(/\/+$/, ""))
        .filter(Boolean),
    ),
  ];
  const photo = !values["no-photo"];
  const time = () => new Date().toLocaleTimeString("th-TH");
  const log = (m: string) => console.log(`[${time()}] ${m}`);

  const sim = values.simulate ? simulatedSource(undefined, { photo }) : null;
  const agent = await startCardAgent({ port: Number(values.port), origins, source: sim ?? pcscSource({ photo }), log });

  console.log(`
มานะ — โปรแกรมเชื่อมเครื่องอ่านบัตร
  ทำงานที่      http://127.0.0.1:${agent.port}
  เว็บที่อนุญาต  ${origins.join(", ")}
  รูปจากบัตร     ${photo ? "ส่ง" : "ไม่ส่ง"}
  ${sim ? "โหมดจำลอง: กด Enter เพื่อเสียบ/ถอดบัตรจำลอง" : "เสียบบัตรประชาชนที่เครื่องอ่านได้เลย"} · ปิดหน้าต่างนี้เพื่อหยุด
`);

  if (sim) {
    let inserted = false;
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", async () => {
      inserted = !inserted;
      if (inserted) await sim.insert();
      else {
        sim.remove();
        log("ถอดบัตรจำลองแล้ว");
      }
    });
  }

  const stop = async () => {
    await agent.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error("เริ่มโปรแกรมไม่สำเร็จ:", e instanceof Error ? e.message : e);
  if ((e as NodeJS.ErrnoException)?.code === "EADDRINUSE") console.error("มีโปรแกรมเชื่อมเครื่องอ่านบัตรเปิดอยู่แล้ว (พอร์ตถูกใช้)");
  process.exitCode = 1;
});
