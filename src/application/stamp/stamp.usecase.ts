import { ID_TYPE_LABEL, PURPOSE_LABEL, visitingText } from "@/domain/visit/labels";
import type { StampStatus } from "@/domain/visit/types";
import type { CheckOutRepository, VisitStatus } from "../check-out/check-out.types";

/** การอนุมัติ E-Stamp ผ่านลิงก์ — การถือ token (สุ่ม 192 bit) ถือเป็นสิทธิ์ของ Host */
export interface StampDeps {
  /** ค้นด้วย stamp token เท่านั้น (ไม่ผูกองค์กร — token คือสิทธิ์) */
  visits: Pick<CheckOutRepository, "findByStampToken" | "approveStamp" | "rejectStamp">;
  now?: () => Date;
}

export class StampError extends Error {}

export interface StampRequestView {
  visitorName: string;
  company: string | null;
  idLabel: string;
  idNumberMasked: string;
  facePhotoUrl: string | null;
  purposeLabel: string;
  visiting: string;
  hostName: string | null;
  checkInText: string;
  plate: string | null;
  stampStatus: StampStatus;
  visitStatus: VisitStatus;
  stampedText: string | null;
  /** ลิงก์หมดอายุ (พ้นเวลา OTP) */
  expired: boolean;
  /** ยังกดอนุมัติ/ปฏิเสธได้ */
  actionable: boolean;
}

const fmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

async function load(token: string, deps: StampDeps) {
  if (!TOKEN_RE.test(token)) return null;
  return deps.visits.findByStampToken(token);
}

export async function getStampRequest(token: string, deps: StampDeps): Promise<StampRequestView | null> {
  const v = await load(token, deps);
  if (!v) return null;
  const now = deps.now?.() ?? new Date();
  const expired = !!v.stampOtpExpiresAt && v.stampOtpExpiresAt < now;

  return {
    visitorName: v.visitor.fullName,
    company: v.visitor.company,
    idLabel: ID_TYPE_LABEL[v.visitor.idType],
    idNumberMasked: v.visitor.idNumberMasked,
    // ต่อท้าย token เพื่อให้ Host เปิดรูปได้โดยไม่ต้อง login (route ตรวจว่าเป็นรูปของรายการนี้)
    facePhotoUrl: v.facePhotoUrl ? `${v.facePhotoUrl}?st=${encodeURIComponent(token)}` : null,
    purposeLabel: PURPOSE_LABEL[v.purpose],
    visiting: visitingText(v.mode, v.tenant, v.host?.department),
    hostName: v.host?.fullName ?? null,
    checkInText: fmt.format(v.checkInAt),
    plate: v.vehicle ? [v.vehicle.plateNumber, v.vehicle.plateProvince].filter(Boolean).join(" ") : null,
    stampStatus: v.stampStatus,
    visitStatus: v.status,
    stampedText: v.stampedAt ? fmt.format(v.stampedAt) : null,
    expired,
    actionable: v.stampStatus === "PENDING" && v.status === "CHECKED_IN" && !expired,
  };
}

export async function decideStampByLink(
  token: string,
  decision: "APPROVE" | "REJECT",
  reason: string | undefined,
  deps: StampDeps,
): Promise<StampRequestView> {
  const v = await load(token, deps);
  if (!v) throw new StampError("ลิงก์ไม่ถูกต้อง");

  const view = await getStampRequest(token, deps);
  if (!view?.actionable) {
    throw new StampError(
      v.status !== "CHECKED_IN"
        ? "ผู้ติดต่อออกจากอาคารไปแล้ว"
        : view?.expired
          ? "ลิงก์หมดอายุแล้ว กรุณาติดต่อเคาน์เตอร์"
          : "รายการนี้ได้รับการตัดสินแล้ว",
    );
  }

  const now = deps.now?.() ?? new Date();
  const by = v.host?.fullName ?? "Host";
  const note = reason?.trim().slice(0, 200) || undefined;
  const ok =
    decision === "APPROVE"
      ? await deps.visits.approveStamp(v.id, "WEB_LINK", now, by, note)
      : await deps.visits.rejectStamp(v.id, now, by, note);
  if (!ok) throw new StampError("รายการนี้ได้รับการตัดสินแล้ว");

  return (await getStampRequest(token, deps))!;
}
