import type { HighRiskWork, PpeItem, SiteMode, StampStatus } from "@/domain/visit/types";

/** ข้อมูลบนสลิป — plain object (serializable) ส่งจาก Server → Client component */
export interface PassViewModel {
  passCode: string;
  qrToken: string;
  siteName: string;
  mode: SiteMode;
  visitorName: string;
  company: string | null;
  idTypeLabel: string;
  idNumberMasked: string;
  facePhotoUrl: string | null;
  purposeLabel: string;
  visiting: string; // "บจก. ABC · ชั้น 12" / "บ้าน 99/12 · ซอย 3" หรือแผนก
  hostName: string | null;
  checkInText: string;
  validUntilText: string;
  badgeNumber: string | null;
  vehicle: { plate: string; typeLabel: string; bay: string | null } | null;
  // Office
  stampStatus: StampStatus;
  // Factory
  ppe: PpeItem[];
  highRiskWorks: HighRiskWork[];
  workPermitId: string | null;
  inductionOk: boolean;
  /** ช่องเพิ่มเติมที่องค์กรตั้งให้แสดงบนบัตร */
  extras: { label: string; value: string }[];
}
