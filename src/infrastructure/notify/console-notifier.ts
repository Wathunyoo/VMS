import type { Notifier } from "@/application/ports";

/** ใช้เมื่อยังไม่ได้ตั้งค่า LINE หรือ Host ยังไม่ได้ผูกบัญชี LINE — แสดงลิงก์/OTP ใน log ของเซิร์ฟเวอร์ */
export const consoleNotifier: Notifier = {
  async sendStampRequest(host, m) {
    console.info(
      `[E-Stamp] แจ้ง ${host.fullName} <${host.email ?? host.phone ?? "-"}>: ` +
        `${m.visitorName} มาพบ — อนุมัติที่ ${m.stampUrl} หรือ OTP ${m.otp}`,
    );
    return { channel: "CONSOLE", ok: true };
  },
  async sendGuestArrived(host, m) {
    console.info(`[แขกมาถึง] แจ้ง ${host.fullName}: ${m.visitorName} มาถึง ${m.placeText} เวลา ${m.checkInText} (แจ้งไว้โดย ${m.invitedBy})`);
    return { channel: "CONSOLE", ok: true };
  },
};
