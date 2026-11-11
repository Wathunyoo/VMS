/**
 * โปรแกรมเชื่อมเครื่องอ่านบัตร (Card Agent) — รันบนคอมพิวเตอร์ที่ป้อมยาม
 * เบราว์เซอร์อ่านเครื่องอ่านบัตร (PC/SC) เองไม่ได้ จึงให้โปรแกรมนี้อ่านแล้วส่งต่อให้หน้า Check-in
 *
 *  GET /v1/status  → สถานะเครื่องอ่าน/บัตร
 *  GET /v1/events  → Server-Sent Events: status · card · error
 *
 * ความปลอดภัย
 *  - ฟังเฉพาะ 127.0.0.1 (เครื่องอื่นในเครือข่ายเรียกไม่ได้) + ตรวจ Host header กัน DNS rebinding
 *  - ส่งข้อมูลให้เฉพาะเว็บที่อยู่ในรายชื่อที่อนุญาต (Origin) — เว็บอื่นอ่านข้อมูลบัตรไม่ได้
 *  - ไม่บันทึกข้อมูลบัตรลงดิสก์ · ถอดบัตรแล้วล้างจากหน่วยความจำทันที
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { CARD_AGENT_PROTOCOL, displayName, type CardAgentCard, type CardAgentStatus, type ThaiIdCardData } from "@/domain/idcard/thai-smartcard";

export interface CardSourceEvents {
  reader(name: string | null): void;
  reading(): void;
  card(data: ThaiIdCardData): void;
  error(message: string): void;
  removed(): void;
}

/** แหล่งข้อมูลบัตร: เครื่องอ่านจริง (PC/SC) หรือบัตรจำลอง */
export interface CardSource {
  start(on: CardSourceEvents): Promise<void>;
  stop(): Promise<void>;
}

export interface CardAgentOptions {
  port: number;
  /** เว็บที่อนุญาต เช่น https://mana.example.com, http://localhost:3000 */
  origins: string[];
  source: CardSource;
  log?: (msg: string) => void;
}

export function toAgentCard(d: ThaiIdCardData): CardAgentCard {
  return {
    cid: d.cid,
    fullName: displayName(d.thName),
    prefix: d.thName.prefix,
    fullNameEn: displayName(d.enName),
    expireDate: d.expireDate,
    photo: d.photo ? `data:image/jpeg;base64,${Buffer.from(d.photo).toString("base64")}` : null,
  };
}

const normalizeOrigin = (o: string) => o.trim().replace(/\/+$/, "").toLowerCase();

export async function startCardAgent(opts: CardAgentOptions): Promise<{ server: Server; port: number; close: () => Promise<void> }> {
  const log = opts.log ?? (() => {});
  const allowed = new Set(opts.origins.map(normalizeOrigin).filter(Boolean));
  const status: CardAgentStatus = { protocol: CARD_AGENT_PROTOCOL, agent: "mana-card-agent", reader: null, card: "absent" };
  let current: CardAgentCard | null = null;
  const clients = new Set<ServerResponse>();

  const send = (res: ServerResponse, event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const broadcast = (event: string, data: unknown) => clients.forEach((c) => send(c, event, data));
  const pushStatus = () => broadcast("status", status);

  await opts.source.start({
    reader(name) {
      status.reader = name;
      if (!name) {
        status.card = "absent";
        current = null;
      }
      log(name ? `พบเครื่องอ่านบัตร: ${name}` : "ไม่พบเครื่องอ่านบัตร");
      pushStatus();
    },
    reading() {
      status.card = "reading";
      pushStatus();
    },
    card(d) {
      status.card = "present";
      current = toAgentCard(d);
      log(`อ่านบัตรแล้ว (เลขลงท้าย ${d.cid.slice(-4)}) → ส่งให้ ${clients.size} หน้าจอ`);
      pushStatus();
      broadcast("card", current);
    },
    error(message) {
      status.card = "present";
      log(`อ่านบัตรไม่สำเร็จ: ${message}`);
      pushStatus();
      broadcast("error", { message });
    },
    removed() {
      status.card = "absent";
      current = null;
      pushStatus();
    },
  });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    if (host !== "127.0.0.1" && host !== "localhost") {
      res.writeHead(421).end();
      return;
    }
    const origin = typeof req.headers.origin === "string" ? normalizeOrigin(req.headers.origin) : "";
    if (!origin || !allowed.has(origin)) {
      // เปิดตรง ๆ จากเบราว์เซอร์ (ไม่มี Origin) ดูสถานะได้ แต่ไม่ได้ข้อมูลบัตร
      if (!origin && req.method === "GET" && req.url === "/v1/status") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(status));
        return;
      }
      log(`ปฏิเสธเว็บที่ไม่ได้รับอนุญาต: ${origin || "(ไม่ระบุ)"}`);
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("origin not allowed");
      return;
    }
    const cors = {
      "Access-Control-Allow-Origin": req.headers.origin as string,
      "Access-Control-Allow-Private-Network": "true",
      Vary: "Origin",
      "Cache-Control": "no-store",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "600" }).end();
      return;
    }
    if (req.method === "GET" && req.url === "/v1/status") {
      res.writeHead(200, { ...cors, "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(status));
      return;
    }
    if (req.method === "GET" && req.url === "/v1/events") {
      res.writeHead(200, { ...cors, "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" });
      res.write("retry: 3000\n\n");
      clients.add(res);
      send(res, "status", status);
      if (current) send(res, "card", current);
      const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
      req.on("close", () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }
    res.writeHead(404, cors).end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;

  return {
    server,
    port,
    close: async () => {
      clients.forEach((c) => c.end());
      await opts.source.stop();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
