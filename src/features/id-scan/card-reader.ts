"use client";

import { useEffect, useRef, useState } from "react";
import { CARD_AGENT_DEFAULT_URL, CARD_AGENT_PROTOCOL, type CardAgentCard, type CardAgentStatus } from "@/domain/idcard/thai-smartcard";

/**
 * เชื่อมกับโปรแกรมเชื่อมเครื่องอ่านบัตรที่รันบนเครื่องนี้ (127.0.0.1)
 * — ไม่มีโปรแกรม = "offline" (ไม่แสดงอะไร ใช้การสแกนด้วยกล้องตามปกติ)
 */
export type CardReaderState =
  | { kind: "offline" }
  | { kind: "noreader" }
  | { kind: "ready"; reader: string }
  | { kind: "reading"; reader: string }
  | { kind: "error"; message: string };

const PROBE_EVERY_MS = 15_000;

export const cardAgentUrl = () => (process.env.NEXT_PUBLIC_CARD_AGENT_URL || CARD_AGENT_DEFAULT_URL).replace(/\/+$/, "");

export function useCardReader(onCard: (card: CardAgentCard) => void): CardReaderState {
  const [state, setState] = useState<CardReaderState>({ kind: "offline" });
  const onCardRef = useRef(onCard);
  useEffect(() => {
    onCardRef.current = onCard;
  });

  useEffect(() => {
    const base = cardAgentUrl();
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    // กันใช้ข้อมูลบัตรใบเดิมซ้ำ (เช่นเชื่อมต่อใหม่ระหว่างบัตรยังเสียบอยู่)
    let appliedCid: string | null = null;

    const fromStatus = (s: CardAgentStatus): CardReaderState =>
      !s.reader ? { kind: "noreader" } : s.card === "reading" ? { kind: "reading", reader: s.reader } : { kind: "ready", reader: s.reader };

    const schedule = () => {
      if (!stopped) timer = setTimeout(probe, PROBE_EVERY_MS);
    };

    async function probe() {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1500);
        const r = await fetch(`${base}/v1/status`, { signal: ctl.signal, cache: "no-store" });
        clearTimeout(t);
        const s = (await r.json()) as CardAgentStatus;
        if (!r.ok || s.protocol !== CARD_AGENT_PROTOCOL) throw new Error("bad agent");
        if (stopped) return;
        setState(fromStatus(s));
        connect();
      } catch {
        if (!stopped) setState({ kind: "offline" });
        schedule();
      }
    }

    function connect() {
      es = new EventSource(`${base}/v1/events`);
      es.addEventListener("status", (e) => {
        const s = JSON.parse((e as MessageEvent).data) as CardAgentStatus;
        if (s.card === "absent") appliedCid = null;
        setState(fromStatus(s));
      });
      es.addEventListener("card", (e) => {
        const card = JSON.parse((e as MessageEvent).data) as CardAgentCard;
        if (card.cid === appliedCid) return;
        appliedCid = card.cid;
        onCardRef.current(card);
      });
      es.addEventListener("error", (e) => {
        const data = (e as MessageEvent).data;
        if (typeof data === "string") {
          setState({ kind: "error", message: (JSON.parse(data) as { message: string }).message });
          return;
        }
        // การเชื่อมต่อหลุด (ปิดโปรแกรม) → กลับไปตรวจหาเป็นระยะ
        es?.close();
        es = null;
        if (!stopped) setState({ kind: "offline" });
        schedule();
      });
    }

    void probe();
    return () => {
      stopped = true;
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return state;
}
