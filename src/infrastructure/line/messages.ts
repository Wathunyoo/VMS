import type { GuestArrivedMessage, StampRequestMessage } from "@/application/ports";
import type { LineMessage } from "./line-client";
import { APP_NAME } from "@/lib/brand";

const text = (t: string): LineMessage => ({ type: "text", text: t });

function row(label: string, value: string) {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: label, color: "#888888", size: "sm", flex: 3 },
      { type: "text", text: value, wrap: true, size: "sm", flex: 7, color: "#222222" },
    ],
  };
}

/**
 * ข้อความแจ้ง Host — ตั้งใจไม่แนบรูปใบหน้า (ไม่ส่งข้อมูลชีวภาพให้บุคคลที่สาม)
 * ปุ่มเปิดหน้า /stamp/:token ซึ่งแสดงรายละเอียดเต็มและให้อนุมัติ/ปฏิเสธ
 */
export function stampRequestMessage(m: StampRequestMessage): LineMessage {
  const rows = [row("ผู้ติดต่อ", m.visitorName)];
  if (m.company) rows.push(row("บริษัท", m.company));
  rows.push(row("วัตถุประสงค์", m.purposeLabel), row("เวลาเข้า", m.checkInText));
  if (m.plate) rows.push(row("ทะเบียนรถ", m.plate));

  return {
    type: "flex",
    altText: `${APP_NAME}: มีคนมาหานะ — ${m.visitorName} กรุณายืนยัน E-Stamp`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1d4ed8",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "มีคนมาหานะ", color: "#ffffff", weight: "bold", size: "lg" },
          { type: "text", text: "กรุณายืนยันก่อนผู้ติดต่อออกจากอาคาร", color: "#dbeafe", size: "xs" },
        ],
      },
      body: { type: "box", layout: "vertical", spacing: "sm", contents: rows },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#16a34a",
            action: { type: "uri", label: "เปิดเพื่ออนุมัติ / ไม่อนุมัติ", uri: m.stampUrl },
          },
          {
            type: "text",
            text: `หรือแจ้งรหัส OTP ${m.otp} ให้ผู้ติดต่อแสดงที่จุด รปภ.`,
            size: "xs",
            color: "#888888",
            wrap: true,
            align: "center",
          },
        ],
      },
    },
  };
}

/** แขกที่ลูกบ้านแจ้งไว้มาถึงแล้ว — ส่งให้สมาชิกทุกคนในบ้าน (ข้อความแจ้งให้ทราบ ไม่ต้องกดอะไร) */
export function guestArrivedMessage(m: GuestArrivedMessage): LineMessage {
  const rows = [row("แขก", m.visitorName), row("ที่", m.placeText), row("เวลาเข้า", m.checkInText)];
  if (m.plate) rows.push(row("ทะเบียนรถ", m.plate));
  rows.push(row("แจ้งไว้โดย", m.invitedBy), row("ช่วงที่แจ้ง", m.windowText));
  return {
    type: "flex",
    altText: `${APP_NAME}: มีคนมาหานะ — ${m.visitorName} มาถึงแล้ว`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#16a34a",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "มีคนมาหานะ", color: "#ffffff", weight: "bold", size: "lg" },
          { type: "text", text: "แขกที่แจ้งไว้ล่วงหน้า ผ่านจุด รปภ. แล้ว", color: "#dcfce7", size: "xs" },
        ],
      },
      body: { type: "box", layout: "vertical", spacing: "sm", contents: rows },
    },
  };
}

/** ปุ่มเปิดหน้า "แจ้งแขกล่วงหน้า" — 1 ปุ่มต่อ 1 รายชื่อที่บัญชี LINE นี้เชื่อมไว้ */
export function inviteLinksMessage(links: { label: string; url: string }[]): LineMessage {
  return {
    type: "flex",
    altText: `${APP_NAME}: แจ้งแขกล่วงหน้า`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "แจ้งแขกล่วงหน้า", weight: "bold", size: "lg" },
          {
            type: "text",
            text: "ระบุวัน-เวลาและทะเบียนรถ แล้วส่ง QR ให้แขก แขกแสดง QR ที่ป้อม รปภ. ได้เลย (ลิงก์นี้ใช้ได้ 24 ชั่วโมง)",
            size: "sm",
            color: "#666666",
            wrap: true,
          },
          ...links.slice(0, 5).map((l) => ({
            type: "button",
            style: "primary",
            color: "#16a34a",
            action: { type: "uri", label: l.label.slice(0, 40), uri: l.url },
          })),
        ],
      },
    },
  };
}

export const replies = {
  welcome: (basicHint: string) =>
    text(
      `สวัสดีครับ 👋 ระบบแจ้งเตือนผู้มาติดต่อ\n\nเพื่อรับแจ้งเตือน กรุณาพิมพ์รหัสเชื่อมต่อ 6 หลักที่ได้รับจากผู้ดูแลระบบ${basicHint}`,
    ),
  linked: (hostName: string) =>
    text(`✅ เชื่อมต่อสำเร็จ\nคุณ ${hostName} จะได้รับแจ้งเตือนทาง LINE เมื่อมีผู้มาพบ\n\nมีแขกจะมา? พิมพ์ “แจ้งแขก” เพื่อสร้าง QR ส่งให้แขกได้เลย`),
  badCode: () => text("❌ รหัสไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่จากผู้ดูแลระบบ"),
  alreadyLinkedOther: () =>
    text("บัญชี LINE นี้เชื่อมกับรายชื่ออื่นอยู่แล้ว — ระบบย้ายการเชื่อมต่อมาที่รายชื่อใหม่ให้แล้ว"),
  help: () =>
    text("• พิมพ์รหัสเชื่อมต่อ 6 หลักที่ได้รับจากผู้ดูแลระบบ เพื่อรับแจ้งเตือนผู้มาติดต่อ\n• พิมพ์ “แจ้งแขก” เพื่อแจ้งแขกล่วงหน้าและสร้าง QR ให้แขก"),
  inviteNotLinked: () => text("บัญชี LINE นี้ยังไม่ได้เชื่อมกับรายชื่อลูกบ้าน — พิมพ์รหัสเชื่อมต่อ 6 หลักที่ได้รับจากผู้ดูแลระบบก่อน แล้วพิมพ์ “แจ้งแขก” อีกครั้ง"),
  test: (hostName: string) => text(`🔔 ทดสอบการแจ้งเตือน\nคุณ ${hostName} ได้รับข้อความนี้ แปลว่าการแจ้งเตือนทาง LINE ทำงานปกติ`),
};
