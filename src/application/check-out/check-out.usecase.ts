import { HIGH_RISK_LABEL, ID_TYPE_LABEL, PURPOSE_LABEL, stampStatusLabel, VEHICLE_TYPE_LABEL, visitingText } from "@/domain/visit/labels";
import { computeOverstayMinutes, formatDuration, minutesBetween, UNLIMITED_STAY_LABEL } from "@/domain/visit/stay";
import type { SecurityService } from "../ports";
import type { ActiveVisitItem, CheckOutPreview, CheckOutRepository, CheckOutVisitRecord } from "./check-out.types";

export interface CheckOutDeps {
  visits: CheckOutRepository;
  security: Pick<SecurityService, "verifyOtp">;
  /** ตรวจลายเซ็น QR → visit id (null ถ้าปลอม/เสีย) */
  verifyPassToken: (token: string) => { vid: string } | null;
  now?: () => Date;
}

export class CheckOutError extends Error {}

export const MAX_OTP_ATTEMPTS = 5;

const fmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });

// ---------------- Resolve QR / pass code ----------------

/** รับได้ทั้ง QR token (VMS1.xxx), รหัสบัตร "V-7K3Q9P" หรือพิมพ์แค่ "7k3q9p" */
export function normalizePassCode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  const body = code.startsWith("V") && code.length === 7 ? code.slice(1) : code;
  return /^[A-Z0-9]{6}$/.test(body) ? `V-${body}` : null;
}

async function resolveVisit(ref: string, deps: CheckOutDeps): Promise<CheckOutVisitRecord> {
  const input = ref.trim();
  if (input.startsWith("VMS1.")) {
    const payload = deps.verifyPassToken(input);
    if (!payload) throw new CheckOutError("QR Code ไม่ถูกต้องหรือถูกแก้ไข");
    const visit = await deps.visits.findById(payload.vid);
    if (!visit) throw new CheckOutError("ไม่พบข้อมูลการเข้าพื้นที่");
    return visit;
  }
  const code = normalizePassCode(input);
  if (!code) throw new CheckOutError("รูปแบบรหัสบัตรไม่ถูกต้อง (เช่น V-7K3Q9P)");
  const visit = await deps.visits.findByPassCode(code);
  if (!visit) throw new CheckOutError(`ไม่พบบัตร ${code}`);
  return visit;
}

// ---------------- View model ----------------

export function buildPreview(v: CheckOutVisitRecord, now: Date): CheckOutPreview {
  const end = v.checkOutAt ?? now;
  const minutesInside = v.timeSpentMinutes ?? minutesBetween(v.checkInAt, end);
  const overstayMinutes = v.overstayMinutes ?? computeOverstayMinutes(v.expectedCheckOutAt, end);


  return {
    visitId: v.id,
    passCode: v.passCode,
    status: v.status,
    mode: v.mode,
    siteName: v.siteName,
    visitorName: v.visitor.fullName,
    company: v.visitor.company,
    idLabel: ID_TYPE_LABEL[v.visitor.idType],
    idNumberMasked: v.visitor.idNumberMasked,
    facePhotoUrl: v.facePhotoUrl,
    idCardPhotoUrl: v.idCardPhotoUrl,
    visiting: visitingText(v.mode, v.tenant, v.host?.department),
    hostName: v.host?.fullName ?? null,
    purposeLabel: PURPOSE_LABEL[v.purpose],
    checkInText: fmt.format(v.checkInAt),
    expectedText: v.expectedCheckOutAt ? fmt.format(v.expectedCheckOutAt) : UNLIMITED_STAY_LABEL,
    checkOutText: v.checkOutAt ? fmt.format(v.checkOutAt) : null,
    minutesInside,
    durationText: formatDuration(minutesInside),
    overstayMinutes,
    stamp:
      v.stampStatus === "NOT_REQUIRED"
        ? null
        : {
            status: v.stampStatus,
            label: stampStatusLabel(v.mode, v.stampStatus),
            stampedText: v.stampedAt ? fmt.format(v.stampedAt) : null,
            otpLocked: v.stampOtpAttempts >= MAX_OTP_ATTEMPTS,
            otpExpired: !!v.stampOtpExpiresAt && v.stampOtpExpiresAt < now,
          },
    vehicle: v.vehicle
      ? {
          plate: [v.vehicle.plateNumber, v.vehicle.plateProvince].filter(Boolean).join(" "),
          typeLabel: VEHICLE_TYPE_LABEL[v.vehicle.vehicleType],
          bay: v.vehicle.loadingBay,
          weightInKg: v.vehicle.weightInKg,
          weightOutKg: v.vehicle.weightOutKg,
        }
      : null,
    safety: v.safety
      ? { highRisk: v.safety.highRiskWorks.map((r) => HIGH_RISK_LABEL[r]), workPermitId: v.safety.workPermitId }
      : null,
  };
}

export function toActiveItem(v: CheckOutVisitRecord, now: Date): ActiveVisitItem {
  return {
    visitId: v.id,
    passCode: v.passCode,
    visitorName: v.visitor.fullName,
    company: v.visitor.company,
    mode: v.mode,
    siteName: v.siteName,
    checkInText: fmt.format(v.checkInAt),
    durationText: formatDuration(minutesBetween(v.checkInAt, now)),
    overstayMinutes: computeOverstayMinutes(v.expectedCheckOutAt, now),
    plate: v.vehicle?.plateNumber ?? null,
    stampStatus: v.stampStatus,
  };
}

// ---------------- Use cases ----------------

export async function lookupVisit(ref: string, deps: CheckOutDeps): Promise<CheckOutPreview> {
  const visit = await resolveVisit(ref, deps);
  return buildPreview(visit, deps.now?.() ?? new Date());
}

export async function listActiveVisits(deps: CheckOutDeps): Promise<ActiveVisitItem[]> {
  const now = deps.now?.() ?? new Date();
  const visits = await deps.visits.listActive();
  // คนที่อยู่เกินเวลามาก่อน
  return visits.map((v) => toActiveItem(v, now)).sort((a, b) => b.overstayMinutes - a.overstayMinutes);
}

async function requirePendingStamp(visitId: string, deps: CheckOutDeps) {
  const visit = await deps.visits.findById(visitId);
  if (!visit) throw new CheckOutError("ไม่พบข้อมูลการเข้าพื้นที่");
  if (visit.status !== "CHECKED_IN") throw new CheckOutError("ผู้ติดต่อรายนี้ check-out ไปแล้ว");
  if (visit.stampStatus !== "PENDING") throw new CheckOutError("รายการนี้ไม่ได้รอการประทับตรา");
  return visit;
}

export async function approveStampWithOtp(visitId: string, otp: string, deps: CheckOutDeps): Promise<CheckOutPreview> {
  const visit = await requirePendingStamp(visitId, deps);
  const now = deps.now?.() ?? new Date();

  if (visit.stampOtpAttempts >= MAX_OTP_ATTEMPTS) {
    throw new CheckOutError("กรอก OTP ผิดเกินกำหนด — ให้ Host อนุมัติผ่านลิงก์ หรือหัวหน้าประทับแทน");
  }
  if (!visit.stampOtpHash || (visit.stampOtpExpiresAt && visit.stampOtpExpiresAt < now)) {
    throw new CheckOutError("OTP หมดอายุแล้ว");
  }
  if (!/^\d{6}$/.test(otp.trim()) || !deps.security.verifyOtp(otp, visit.stampOtpHash)) {
    const attempts = await deps.visits.recordFailedOtp(visitId);
    const left = Math.max(0, MAX_OTP_ATTEMPTS - attempts);
    throw new CheckOutError(left > 0 ? `OTP ไม่ถูกต้อง (เหลืออีก ${left} ครั้ง)` : "OTP ไม่ถูกต้อง — ถูกล็อกแล้ว");
  }

  if (!(await deps.visits.approveStamp(visitId, "OTP", now))) throw new CheckOutError("รายการนี้ได้รับการตัดสินแล้ว");
  return lookupVisit(visit.passCode, deps);
}

export async function approveStampManually(
  visitId: string,
  reason: string,
  deps: CheckOutDeps,
  actorId?: string,
): Promise<CheckOutPreview> {
  if (reason.trim().length < 3) throw new CheckOutError("กรุณาระบุเหตุผลการประทับตราแทน");
  const visit = await requirePendingStamp(visitId, deps);
  const ok = await deps.visits.approveStamp(visitId, "MANUAL", deps.now?.() ?? new Date(), actorId, reason.trim());
  if (!ok) throw new CheckOutError("รายการนี้ได้รับการตัดสินแล้ว");
  return lookupVisit(visit.passCode, deps);
}

export interface CheckOutResult {
  preview: CheckOutPreview;
  netWeightKg: number | null;
}

export async function checkOutVisit(
  visitId: string,
  opts: { weightOutKg?: number },
  deps: CheckOutDeps,
  actorId?: string,
): Promise<CheckOutResult> {
  const visit = await deps.visits.findById(visitId);
  if (!visit) throw new CheckOutError("ไม่พบข้อมูลการเข้าพื้นที่");
  if (visit.status === "CHECKED_OUT") throw new CheckOutError("ผู้ติดต่อรายนี้ check-out ไปแล้ว");
  if (visit.status !== "CHECKED_IN") throw new CheckOutError("สถานะไม่สามารถ check-out ได้");
  if (opts.weightOutKg != null && (!Number.isFinite(opts.weightOutKg) || opts.weightOutKg < 0)) {
    throw new CheckOutError("น้ำหนักชั่งออกไม่ถูกต้อง");
  }

  const now = deps.now?.() ?? new Date();
  const preview = buildPreview(visit, now);

  const ok = await deps.visits.completeCheckOut(visitId, {
    checkOutAt: now,
    timeSpentMinutes: preview.minutesInside,
    overstayMinutes: preview.overstayMinutes,
    weightOutKg: visit.vehicle ? opts.weightOutKg : undefined,
    checkedOutBy: actorId,
  });
  if (!ok) throw new CheckOutError("ผู้ติดต่อรายนี้ check-out ไปแล้ว");

  const weightIn = visit.vehicle?.weightInKg;
  const netWeightKg = weightIn != null && opts.weightOutKg != null ? Math.abs(weightIn - opts.weightOutKg) : null;

  const done = await deps.visits.findById(visitId);
  return { preview: buildPreview(done!, now), netWeightKg };
}
