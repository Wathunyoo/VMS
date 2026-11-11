import "server-only";
import type { Notifier } from "@/application/ports";
import { lineConfig, pushMessage } from "../line/line-client";
import { guestArrivedMessage, stampRequestMessage } from "../line/messages";
import { consoleNotifier } from "./console-notifier";

/** ส่งทาง LINE ถ้าตั้งค่าแล้วและ Host ผูกบัญชีแล้ว — ไม่งั้นใช้ console (ลิงก์/OTP อยู่ใน log) */
export const lineNotifier: Notifier = {
  async sendStampRequest(host, message) {
    if (!lineConfig().canSend || !host.lineUserId) {
      return consoleNotifier.sendStampRequest(host, message);
    }
    try {
      await pushMessage(host.lineUserId, [stampRequestMessage(message)]);
      return { channel: "LINE", ok: true };
    } catch (e) {
      console.error("[line] push failed", e);
      // สำรอง: ให้ รปภ. ยังเห็นลิงก์/OTP ใน log
      await consoleNotifier.sendStampRequest(host, message);
      return { channel: "LINE", ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) };
    }
  },
  async sendGuestArrived(host, message) {
    if (!lineConfig().canSend || !host.lineUserId) return consoleNotifier.sendGuestArrived(host, message);
    try {
      await pushMessage(host.lineUserId, [guestArrivedMessage(message)]);
      return { channel: "LINE", ok: true };
    } catch (e) {
      console.error("[line] push failed", e);
      return { channel: "LINE", ok: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) };
    }
  },
};
