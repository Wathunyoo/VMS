import { visitingText } from "@/domain/visit/labels";
import type { CurrentStaff } from "../auth/auth.types";
import type { HostLineRecord, HostLineRepository, HostLineView, LineMessenger, LineWebhookEvent } from "./host-line.types";

export interface HostLineDeps {
  hosts: HostLineRepository;
  line: LineMessenger;
  /** สุ่มรหัส 6 หลัก */
  randomCode: () => string;
  /** ลิงก์หน้า "แจ้งแขก" ของรายชื่อนี้ (เซ็นแล้ว มีวันหมดอายุ) */
  residentLink?: (hostId: string, lineUserId: string, now: Date) => string;
  now?: () => Date;
}

export class HostLineError extends Error {}

const CODE_TTL_MS = 24 * 3600_000;
const fmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });

function requireAdmin(actor: CurrentStaff) {
  if (actor.role !== "ADMIN") throw new HostLineError("ไม่มีสิทธิ์");
}

function toView(h: HostLineRecord, now: Date): HostLineView {
  const codeValid = !!h.lineLinkCode && !!h.lineLinkCodeExpiresAt && h.lineLinkCodeExpiresAt > now;
  return {
    id: h.id,
    fullName: h.fullName,
    department: h.department,
    tenantName: h.tenant?.name ?? null,
    floor: h.tenant?.floor ?? null,
    placeText: h.tenant ? visitingText(h.site.mode, h.tenant) : h.site.mode === "FACTORY" ? "โรงงาน" : "ไม่ระบุบริษัท/บ้าน",
    linked: !!h.lineUserId,
    lineDisplayName: h.lineDisplayName,
    linkedText: h.lineLinkedAt ? fmt.format(h.lineLinkedAt) : null,
    pendingCode: codeValid ? h.lineLinkCode : null,
    codeExpiresText: codeValid ? fmt.format(h.lineLinkCodeExpiresAt!) : null,
  };
}

export async function listHostsForLine(actor: CurrentStaff, deps: HostLineDeps): Promise<HostLineView[]> {
  requireAdmin(actor);
  const now = deps.now?.() ?? new Date();
  return (await deps.hosts.list()).map((h) => toView(h, now));
}

export async function createLinkCode(actor: CurrentStaff, hostId: string, deps: HostLineDeps): Promise<HostLineView> {
  requireAdmin(actor);
  const now = deps.now?.() ?? new Date();
  if (!(await deps.hosts.findById(hostId))) throw new HostLineError("ไม่พบรายชื่อ Host");
  for (let i = 0; i < 5; i++) {
    if (await deps.hosts.setLinkCode(hostId, deps.randomCode(), new Date(now.getTime() + CODE_TTL_MS))) {
      return toView((await deps.hosts.findById(hostId))!, now);
    }
  }
  throw new HostLineError("สร้างรหัสไม่สำเร็จ กรุณาลองใหม่");
}

export async function unlinkHostLine(actor: CurrentStaff, hostId: string, deps: HostLineDeps): Promise<void> {
  requireAdmin(actor);
  await deps.hosts.unlink(hostId);
}

export async function sendTestMessage(actor: CurrentStaff, hostId: string, deps: HostLineDeps): Promise<void> {
  requireAdmin(actor);
  if (!deps.line.configured().canSend) throw new HostLineError("ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN");
  const host = await deps.hosts.findById(hostId);
  if (!host?.lineUserId) throw new HostLineError("Host รายนี้ยังไม่ได้เชื่อมต่อ LINE");
  try {
    await deps.line.pushTest(host.lineUserId, host.fullName);
  } catch (e) {
    throw new HostLineError(`ส่งไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
  }
}

/** "แจ้งแขก", "เชิญแขก", "นัดแขก", "แขก", "invite" */
export const isInviteKeyword = (text: string) => /^(แจ้ง|เชิญ|นัด|ลงทะเบียน)?\s*แขก(ล่วงหน้า)?$|^invite$/i.test(text.trim());

/** รหัส 6 หลักในข้อความ (รองรับ "123 456", "รหัส 123456") */
function extractCode(text: string): string | null {
  const digits = text.replace(/[\s-]/g, "").match(/\d+/g);
  return digits?.length === 1 && digits[0].length === 6 ? digits[0] : null;
}

export async function handleLineEvents(events: LineWebhookEvent[], deps: HostLineDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();
  for (const e of events) {
    try {
      if (e.type === "follow") {
        if (e.replyToken) await deps.line.replyWelcome(e.replyToken);
      } else if (e.type === "unfollow") {
        await deps.hosts.unlinkByUserId(e.userId);
      } else if (e.type === "text") {
        if (isInviteKeyword(e.text) && deps.residentLink) {
          if (!e.replyToken) continue;
          const hosts = await deps.hosts.invitableByUserId(e.userId);
          if (!hosts.length) await deps.line.replyInviteNotLinked(e.replyToken);
          else
            await deps.line.replyInviteLinks(
              e.replyToken,
              hosts.map((h) => ({
                label: hosts.length > 1 ? h.placeText : "แจ้งแขกล่วงหน้า",
                url: deps.residentLink!(h.id, e.userId, now),
              })),
            );
          continue;
        }
        const code = extractCode(e.text);
        if (!code) {
          if (e.replyToken) await deps.line.replyHelp(e.replyToken);
          continue;
        }
        const host = await deps.hosts.findByValidCode(code, now);
        if (!host) {
          if (e.replyToken) await deps.line.replyBadCode(e.replyToken);
          continue;
        }
        const moved = await deps.hosts.link(host.id, e.userId, await deps.line.displayName(e.userId), now);
        if (e.replyToken) await deps.line.replyLinked(e.replyToken, host.fullName, moved);
      }
    } catch (err) {
      // เหตุการณ์หนึ่งล้มเหลวไม่ควรทำให้เหตุการณ์อื่นหาย
      console.error("[line webhook] event failed", e.type, err);
    }
  }
}
