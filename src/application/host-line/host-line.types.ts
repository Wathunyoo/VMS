import type { SiteMode } from "@/domain/visit/types";

export interface HostLineView {
  id: string;
  fullName: string;
  department: string | null;
  tenantName: string | null;
  floor: string | null;
  /** "บจก. ABC · ชั้น 12" / "บ้าน 99/1 · ซอย 2" */
  placeText: string;
  linked: boolean;
  lineDisplayName: string | null;
  linkedText: string | null;
  pendingCode: string | null;
  codeExpiresText: string | null;
}

export interface HostLineRecord {
  id: string;
  fullName: string;
  department: string | null;
  tenant: { name: string; floor: string } | null;
  site: { mode: SiteMode };
  lineUserId: string | null;
  lineDisplayName: string | null;
  lineLinkedAt: Date | null;
  lineLinkCode: string | null;
  lineLinkCodeExpiresAt: Date | null;
}

export interface HostLineRepository {
  list(): Promise<HostLineRecord[]>;
  findById(id: string): Promise<HostLineRecord | null>;
  findByValidCode(code: string, now: Date): Promise<HostLineRecord | null>;
  /** คืน false ถ้ารหัสชนกับของ Host อื่น */
  setLinkCode(hostId: string, code: string, expiresAt: Date): Promise<boolean>;
  /** ผูก userId กับ Host (ถ้า userId เคยผูกกับ Host อื่น ให้ย้ายมา) — คืน true ถ้ามีการย้าย */
  link(hostId: string, userId: string, displayName: string | null, at: Date): Promise<boolean>;
  unlink(hostId: string): Promise<void>;
  unlinkByUserId(userId: string): Promise<void>;
  /** รายชื่อที่บัญชี LINE นี้เชื่อมไว้ (ทุกองค์กร) ที่แจ้งแขกล่วงหน้าได้ */
  invitableByUserId(userId: string): Promise<{ id: string; fullName: string; placeText: string }[]>;
}

/** การส่งข้อความ LINE ในระดับความหมาย (ตัวข้อความจริงอยู่ใน infrastructure) */
export interface LineMessenger {
  configured(): { canSend: boolean; canReceive: boolean; addFriendUrl: string | null; basicId: string | null };
  displayName(userId: string): Promise<string | null>;
  pushTest(userId: string, hostName: string): Promise<void>;
  replyWelcome(replyToken: string): Promise<void>;
  replyLinked(replyToken: string, hostName: string, moved: boolean): Promise<void>;
  replyBadCode(replyToken: string): Promise<void>;
  replyHelp(replyToken: string): Promise<void>;
  replyInviteLinks(replyToken: string, links: { label: string; url: string }[]): Promise<void>;
  replyInviteNotLinked(replyToken: string): Promise<void>;
}

/** เหตุการณ์จาก webhook ที่ระบบสนใจ (ย่อจากรูปแบบของ LINE) */
export type LineWebhookEvent =
  | { type: "follow"; userId: string; replyToken?: string }
  | { type: "unfollow"; userId: string }
  | { type: "text"; userId: string; replyToken?: string; text: string };
