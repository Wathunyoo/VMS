import type { CustomValue } from "@/domain/form/form-config";
import type { SiteMode } from "@/domain/visit/types";
import type { CheckInInput } from "./check-in/check-in.schema";

/** Ports (interfaces) — application layer ไม่รู้จัก Prisma/fs/crypto โดยตรง */

export interface SitePolicy {
  id: string;
  name: string;
  mode: SiteMode;
  /** null = ไม่จำกัดเวลา */
  defaultMaxStayMinutes: number | null;
  inductionVersion: string | null;
  /** โหมดขององค์กร — ทุกการ Check-in ต้องตรงกับโหมดนี้ */
  orgMode: SiteMode | null;
}

export interface NewVisitRecord {
  input: CheckInInput;
  passCode: string;
  idNumberHash: string;
  idNumberMasked: string;
  facePhotoUrl?: string;
  platePhotoUrl?: string;
  idCardPhotoUrl?: string;
  checkInAt: Date;
  expectedCheckOutAt: Date | null;
  inductionVersion: string | null;
  stamp: { token: string; otpHash: string; otpExpiresAt: Date } | null;
  checkedInBy?: string;
  customValues: CustomValue[];
  /** แขกที่แจ้งล่วงหน้า — ทำเครื่องหมายว่าใช้แล้วใน transaction เดียวกัน */
  inviteId?: string;
}

export interface VisitRepository {
  getSitePolicy(siteId: string): Promise<SitePolicy | null>;
  isBlacklisted(idType: CheckInInput["idType"], idNumberHash: string): Promise<boolean>;
  createCheckIn(record: NewVisitRecord): Promise<{
    visitId: string;
    hostContact: HostContact | null;
    /** สมาชิกในบ้าน/บริษัทเดียวกันที่เชื่อม LINE แล้ว (เฉพาะแขกที่แจ้งล่วงหน้า) */
    household: HostContact[];
  }>;
  recordNotification(visitId: string, result: NotifyResult): Promise<void>;
}

export interface HostContact {
  fullName: string;
  email: string | null;
  phone: string | null;
  lineUserId: string | null;
}

export interface StampRequestMessage {
  visitorName: string;
  company: string | null;
  purposeLabel: string;
  checkInText: string;
  plate: string | null;
  stampUrl: string;
  otp: string;
}

export interface NotifyResult {
  channel: "LINE" | "CONSOLE";
  ok: boolean;
  error?: string;
  /** ARRIVAL = แจ้งสมาชิกในบ้านว่าแขกที่แจ้งไว้มาถึงแล้ว */
  kind?: "ARRIVAL";
}

export interface GuestArrivedMessage {
  visitorName: string;
  placeText: string;
  checkInText: string;
  plate: string | null;
  invitedBy: string;
  windowText: string;
}

export interface PhotoStorage {
  saveDataUrl(dataUrl: string, folder: "faces" | "plates" | "idcards"): Promise<string>;
}

export interface SecurityService {
  hashIdNumber(normalizedId: string): string;
  generatePassCode(): string;
  generateStampToken(): string;
  generateOtp(): { otp: string; otpHash: string };
  verifyOtp(otp: string, otpHash: string): boolean;
}

export interface Notifier {
  sendStampRequest(host: HostContact, message: StampRequestMessage): Promise<NotifyResult>;
  sendGuestArrived(host: HostContact, message: GuestArrivedMessage): Promise<NotifyResult>;
}

export interface Mailer {
  send(to: string, subject: string, text: string, html: string): Promise<void>;
}

export interface TokenService {
  /** token สุ่ม + hash ที่เก็บใน DB */
  create(): { token: string; hash: string };
  hash(token: string): string;
}
