import type {
  HighRiskWork,
  IdDocumentType,
  SiteMode,
  StampStatus,
  VehicleType,
  VisitPurpose,
} from "@/domain/visit/types";

export type VisitStatus = "PENDING_APPROVAL" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED";

/** ข้อมูลดิบที่ repository ส่งให้ use case (Decimal แปลงเป็น number แล้ว) */
export interface CheckOutVisitRecord {
  id: string;
  passCode: string;
  status: VisitStatus;
  mode: SiteMode;
  siteName: string;
  visitor: { fullName: string; company: string | null; idType: IdDocumentType; idNumberMasked: string };
  facePhotoUrl: string | null;
  idCardPhotoUrl: string | null;
  host: { fullName: string; department: string | null } | null;
  tenant: { name: string; floor: string; unit: string | null } | null;
  purpose: VisitPurpose;
  checkInAt: Date;
  expectedCheckOutAt: Date | null;
  checkOutAt: Date | null;
  timeSpentMinutes: number | null;
  overstayMinutes: number | null;
  stampStatus: StampStatus;
  stampedAt: Date | null;
  stampOtpHash: string | null;
  stampOtpExpiresAt: Date | null;
  stampOtpAttempts: number;
  vehicle: {
    plateNumber: string;
    plateProvince: string | null;
    vehicleType: VehicleType;
    loadingBay: string | null;
    weightInKg: number | null;
    weightOutKg: number | null;
  } | null;
  safety: { highRiskWorks: HighRiskWork[]; workPermitId: string | null } | null;
}

export interface CompleteCheckOutData {
  checkOutAt: Date;
  timeSpentMinutes: number;
  overstayMinutes: number;
  weightOutKg?: number;
  checkedOutBy?: string;
}

export interface CheckOutRepository {
  findById(id: string): Promise<CheckOutVisitRecord | null>;
  findByPassCode(passCode: string): Promise<CheckOutVisitRecord | null>;
  listActive(): Promise<CheckOutVisitRecord[]>;
  findByStampToken(token: string): Promise<CheckOutVisitRecord | null>;
  /** อัปเดตเฉพาะเมื่อยัง PENDING และยังอยู่ในพื้นที่ — คืน false ถ้ามีการตัดสินไปก่อนแล้ว */
  approveStamp(id: string, method: "OTP" | "MANUAL" | "WEB_LINK", at: Date, by?: string, note?: string): Promise<boolean>;
  rejectStamp(id: string, at: Date, by?: string, reason?: string): Promise<boolean>;
  /** คืนจำนวนครั้งที่ผิดล่าสุด */
  recordFailedOtp(id: string): Promise<number>;
  /** อัปเดตแบบมีเงื่อนไข status = CHECKED_IN — คืน false ถ้ามีคน check-out ไปก่อนแล้ว */
  completeCheckOut(id: string, data: CompleteCheckOutData): Promise<boolean>;
}

// ---------------- View models (serializable → client) ----------------

export interface CheckOutPreview {
  visitId: string;
  passCode: string;
  status: VisitStatus;
  mode: SiteMode;
  siteName: string;
  visitorName: string;
  company: string | null;
  idLabel: string;
  idNumberMasked: string;
  facePhotoUrl: string | null;
  idCardPhotoUrl: string | null;
  visiting: string;
  hostName: string | null;
  purposeLabel: string;
  checkInText: string;
  expectedText: string;
  checkOutText: string | null;
  minutesInside: number;
  durationText: string;
  overstayMinutes: number;
  stamp: {
    status: StampStatus;
    label: string;
    stampedText: string | null;
    otpLocked: boolean;
    otpExpired: boolean;
  } | null;
  vehicle: {
    plate: string;
    typeLabel: string;
    bay: string | null;
    weightInKg: number | null;
    weightOutKg: number | null;
  } | null;
  safety: { highRisk: string[]; workPermitId: string | null } | null;
}

export interface ActiveVisitItem {
  visitId: string;
  passCode: string;
  visitorName: string;
  company: string | null;
  mode: SiteMode;
  siteName: string;
  checkInText: string;
  durationText: string;
  overstayMinutes: number;
  plate: string | null;
  stampStatus: StampStatus;
}
