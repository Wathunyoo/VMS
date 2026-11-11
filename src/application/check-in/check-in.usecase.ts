import { UNNAMED_VISITOR } from "@/domain/form/form-config";
import { inviteProblem, inviteState, inviteTimeText, inviteWindowText } from "@/domain/invite/guest-invite";
import { maskIdNumber } from "@/domain/visit/id-masking";
import { PURPOSE_LABEL, SITE_TYPE_LABEL, visitingText } from "@/domain/visit/labels";
import { computeExpectedCheckOut } from "@/domain/visit/stay";
import type { Notifier, NotifyResult, PhotoStorage, SecurityService, VisitRepository } from "../ports";
import type { StaffInviteRepository } from "../guest-invite/guest-invite.types";
import type { FormSettingsRepository } from "../settings/form-settings.types";
import type { CheckInInput } from "./check-in.schema";
import { applyFormRules } from "./form-rules";

export interface CheckInDeps {
  visits: VisitRepository;
  photos: PhotoStorage;
  security: SecurityService;
  notifier: Notifier;
  form: Pick<FormSettingsRepository, "config" | "customFields">;
  appUrl: string;
  /** แขกที่แจ้งล่วงหน้า (QR) */
  invites?: Pick<StaffInviteRepository, "findById">;
  now?: () => Date;
}

export class CheckInError extends Error {}

/** ข้อมูลไม่ครบตามแบบฟอร์มขององค์กร — แสดงที่ช่องที่ผิด */
export class CheckInValidationError extends CheckInError {
  constructor(public fieldErrors: Record<string, string[]>) {
    super("กรุณาตรวจสอบข้อมูลที่ไฮไลต์");
  }
}

/** เลขบัตรที่แสดงเมื่อไม่ได้กรอก (แบบฟอร์มตั้งเป็นไม่บังคับ) */
export const NO_ID_MASKED = "ไม่ได้ระบุ";

const STAMP_OTP_TTL_MS = 12 * 60 * 60 * 1000;

export async function checkInVisitor(raw: CheckInInput, deps: CheckInDeps, actorId?: string) {
  const checkInAt = deps.now?.() ?? new Date();

  // แขกที่ลูกบ้านแจ้งล่วงหน้า: ตรวจ QR แล้วใช้บ้าน/ผู้แจ้งตามที่แจ้งไว้เสมอ
  const invite = raw.inviteId ? await deps.invites?.findById(raw.inviteId) : null;
  if (raw.inviteId) {
    if (!invite) throw new CheckInError("ไม่พบรายการแจ้งแขกล่วงหน้า — สแกน QR ใหม่อีกครั้ง");
    const problem = inviteProblem(inviteState(invite, checkInAt), inviteTimeText(invite.validFrom));
    if (problem) throw new CheckInError(problem);
    raw = { ...raw, mode: invite.mode, siteId: invite.siteId, tenantId: invite.tenantId ?? undefined, hostId: invite.hostId };
  }

  const site = await deps.visits.getSitePolicy(raw.siteId);
  if (!site) throw new CheckInError("ไม่พบข้อมูลสถานที่");
  if (site.mode !== raw.mode) throw new CheckInError(`สถานที่นี้เป็น${SITE_TYPE_LABEL[site.mode]}`);
  if (site.orgMode && site.mode !== site.orgMode) throw new CheckInError(`องค์กรนี้ใช้โหมด${SITE_TYPE_LABEL[site.orgMode]}เท่านั้น`);

  const [config, customFields] = await Promise.all([deps.form.config(), deps.form.customFields(false)]);
  const rules = applyFormRules(raw, config, customFields);
  if (Object.keys(rules.errors).length) throw new CheckInValidationError(rules.errors);
  const input = rules.input;

  // ไม่ได้กรอกเลขบัตร (แบบฟอร์มไม่บังคับ) → บันทึกเป็นผู้ติดต่อรายใหม่ทุกครั้ง ตรวจรายชื่อห้ามเข้าไม่ได้
  const hasId = !!input.idNumber;
  const idType = hasId ? input.idType : "OTHER";
  const idNumberHash = deps.security.hashIdNumber(hasId ? input.idNumber : `NOID:${deps.security.generateStampToken()}`);
  if (hasId && (await deps.visits.isBlacklisted(idType, idNumberHash))) {
    throw new CheckInError("ผู้ติดต่อรายนี้อยู่ในรายชื่อห้ามเข้า กรุณาติดต่อหัวหน้า รปภ.");
  }

  const [facePhotoUrl, platePhotoUrl, idCardPhotoUrl] = await Promise.all([
    input.facePhoto ? deps.photos.saveDataUrl(input.facePhoto, "faces") : undefined,
    input.hasVehicle && input.platePhoto ? deps.photos.saveDataUrl(input.platePhoto, "plates") : undefined,
    input.idCardPhoto ? deps.photos.saveDataUrl(input.idCardPhoto, "idcards") : undefined,
  ]);

  // เลือกเองในหน้า Check-in (0 = ไม่จำกัด) หรือใช้ค่าตั้งของสถานที่ (null = ไม่จำกัด)
  const maxStay = input.maxStayMinutes === undefined ? site.defaultMaxStayMinutes : input.maxStayMinutes === 0 ? null : input.maxStayMinutes;

  // E-Stamp: ออฟฟิศ/หมู่บ้าน ที่ระบุผู้รับพบ (Host / ลูกบ้าน) ไว้
  const needsStamp = input.mode !== "FACTORY" && input.requireStamp && !!input.hostId;
  const otp = needsStamp ? deps.security.generateOtp() : null;
  const stamp =
    needsStamp && otp
      ? {
          token: deps.security.generateStampToken(),
          otpHash: otp.otpHash,
          otpExpiresAt: new Date(checkInAt.getTime() + STAMP_OTP_TTL_MS),
        }
      : null;

  const { visitId, hostContact, household } = await deps.visits.createCheckIn({
    input: { ...input, idType },
    passCode: deps.security.generatePassCode(),
    idNumberHash,
    idNumberMasked: hasId ? maskIdNumber(input.idNumber, input.idType) : NO_ID_MASKED,
    facePhotoUrl,
    platePhotoUrl,
    idCardPhotoUrl,
    checkInAt,
    expectedCheckOutAt: computeExpectedCheckOut(checkInAt, maxStay),
    inductionVersion: input.mode === "FACTORY" ? site.inductionVersion : null,
    stamp,
    checkedInBy: actorId,
    customValues: rules.customValues,
    inviteId: invite?.id,
  });

  const record = (p: Promise<NotifyResult>) =>
    p
      .catch((err): NotifyResult => ({ channel: "CONSOLE", ok: false, error: String(err).slice(0, 300) }))
      .then((result) => deps.visits.recordNotification(visitId, result))
      .catch((err) => console.error("[notifier] record failed", err));

  if (stamp && otp && hostContact) {
    // แจ้ง Host แบบ fire-and-forget — ไม่ให้การแจ้งเตือนล้มเหลวแล้วบล็อกการ check-in
    const checkInText = new Intl.DateTimeFormat("th-TH", { timeStyle: "short", timeZone: "Asia/Bangkok" }).format(checkInAt);
    const sent = deps.notifier.sendStampRequest(hostContact, {
        visitorName: input.fullName || UNNAMED_VISITOR,
        company: input.company ?? null,
        purposeLabel: PURPOSE_LABEL[input.purpose],
        checkInText,
        plate: input.hasVehicle ? (input.plateNumber ?? null) : null,
        stampUrl: `${deps.appUrl}/stamp/${stamp.token}`,
        otp: otp.otp,
      });
    void record(sent);
  }

  // แขกที่แจ้งล่วงหน้ามาถึง → แจ้งสมาชิกทุกคนในบ้านที่เชื่อม LINE ไว้
  // (คนที่ได้ข้อความขอ E-Stamp แล้วไม่ต้องได้ซ้ำ)
  if (invite) {
    const stampTo = stamp && hostContact?.lineUserId ? hostContact.lineUserId : null;
    const message = {
      visitorName: input.fullName || invite.guestName || UNNAMED_VISITOR,
      placeText: invite.tenant ? visitingText(invite.mode, invite.tenant) : invite.siteName,
      checkInText: new Intl.DateTimeFormat("th-TH", { timeStyle: "short", timeZone: "Asia/Bangkok" }).format(checkInAt),
      plate: input.hasVehicle ? (input.plateNumber ?? null) : null,
      invitedBy: invite.hostName,
      windowText: inviteWindowText(invite.validFrom, invite.validUntil),
    };
    for (const member of household) {
      if (member.lineUserId && member.lineUserId === stampTo) continue;
      void record(deps.notifier.sendGuestArrived(member, message).then((r) => ({ ...r, kind: "ARRIVAL" as const })));
    }
  }

  return { visitId };
}
