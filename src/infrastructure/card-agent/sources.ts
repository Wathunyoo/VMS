import { createRequire } from "node:module";
import { readThaiIdCard, SmartCardError, type Transmit } from "@/domain/idcard/thai-smartcard";
import { fakeCardTransmit, SAMPLE_CARD, type FakeCardInfo } from "./fake-card";
import type { CardSource, CardSourceEvents } from "./server";

async function readAndEmit(on: CardSourceEvents, transmit: Transmit, atr: Uint8Array | null, photo: boolean) {
  on.reading();
  try {
    on.card(await readThaiIdCard(transmit, { atr, photo }));
  } catch (e) {
    on.error(e instanceof SmartCardError ? e.message : "อ่านบัตรไม่สำเร็จ — ลองถอดแล้วเสียบใหม่ให้สุด");
  }
}

/** บัตรจำลอง: insert()/remove() เรียกจากคีย์บอร์ดหรือชุดทดสอบ */
export function simulatedSource(card: FakeCardInfo = SAMPLE_CARD, opts: { photo?: boolean } = {}) {
  let on: CardSourceEvents | null = null;
  return {
    async start(handlers: CardSourceEvents) {
      on = handlers;
      on.reader("เครื่องอ่านบัตรจำลอง (Simulator)");
    },
    async stop() {
      on = null;
    },
    async insert(info: FakeCardInfo = card, insertOpts: { notThaiId?: boolean } = {}) {
      if (on) await readAndEmit(on, fakeCardTransmit(info, insertOpts), null, opts.photo ?? true);
    },
    remove() {
      on?.removed();
    },
  } satisfies CardSource & Record<string, unknown>;
}

// ---- เครื่องอ่านบัตรจริงผ่าน PC/SC (ต้องติดตั้ง @pokusew/pcsclite) ----

/* eslint-disable @typescript-eslint/no-explicit-any */
export function pcscSource(opts: { photo?: boolean } = {}): CardSource {
  let pcsc: any = null;
  return {
    async start(on) {
      let factory: any;
      try {
        factory = createRequire(import.meta.url)("@pokusew/pcsclite");
      } catch {
        throw new Error("ยังไม่ได้ติดตั้งไลบรารีเครื่องอ่านบัตร — รัน: npm install @pokusew/pcsclite");
      }
      pcsc = factory();
      const readers = new Set<string>();
      on.reader(null);
      pcsc.on("error", (err: Error) => on.error(`ระบบ PC/SC ขัดข้อง: ${err.message}`));
      pcsc.on("reader", (reader: any) => {
        readers.add(reader.name);
        on.reader(reader.name);
        reader.on("error", (err: Error) => on.error(`เครื่องอ่านบัตรขัดข้อง: ${err.message}`));
        reader.on("status", (st: { state: number; atr?: Buffer }) => {
          const changes = reader.state ^ st.state;
          if (changes & reader.SCARD_STATE_EMPTY && st.state & reader.SCARD_STATE_EMPTY) {
            reader.disconnect(reader.SCARD_LEAVE_CARD, () => {});
            on.removed();
          } else if (changes & reader.SCARD_STATE_PRESENT && st.state & reader.SCARD_STATE_PRESENT) {
            reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, (err: Error | null, protocol: number) => {
              if (err) return on.error("เชื่อมต่อบัตรไม่สำเร็จ — ลองถอดแล้วเสียบใหม่");
              const transmit: Transmit = (apdu) =>
                new Promise((resolve, reject) =>
                  reader.transmit(Buffer.from(apdu), 4096, protocol, (e: Error | null, data: Buffer) => (e ? reject(e) : resolve(new Uint8Array(data)))),
                );
              void readAndEmit(on, transmit, st.atr ? new Uint8Array(st.atr) : null, opts.photo ?? true);
            });
          }
        });
        reader.on("end", () => {
          readers.delete(reader.name);
          on.reader([...readers][0] ?? null);
        });
      });
    },
    async stop() {
      pcsc?.close();
      pcsc = null;
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
