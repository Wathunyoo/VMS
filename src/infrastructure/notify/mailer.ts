import "server-only";
import nodemailer from "nodemailer";
import type { Mailer } from "@/application/ports";
import { APP_NAME } from "@/lib/brand";

/**
 * ส่งอีเมลผ่าน SMTP (Gmail / Amazon SES / Resend / Postmark ฯลฯ)
 *   SMTP_URL="smtps://user:pass@smtp.example.com:465"   MAIL_FROM="VMS <no-reply@example.com>"
 * ยังไม่ตั้ง SMTP_URL → แสดงอีเมลใน log ของเซิร์ฟเวอร์แทน (สำหรับทดสอบ)
 */
let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

export const smtpMailer: Mailer = {
  async send(to, subject, text, html) {
    const url = process.env.SMTP_URL?.trim();
    if (!url) {
      console.info(`[mail:console] ถึง ${to} — ${subject}\n${text}\n`);
      return;
    }
    transport ??= nodemailer.createTransport(url);
    await transport.sendMail({ from: process.env.MAIL_FROM || `${APP_NAME} <no-reply@localhost>`, to, subject, text, html });
  },
};
