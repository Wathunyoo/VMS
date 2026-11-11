/**
 * Domain types — ไม่ขึ้นกับ Prisma/Next.js ใช้ได้ทั้งฝั่ง server และ client
 * ค่า string ต้องตรงกับ enum ใน prisma/schema.prisma
 */

export const SITE_MODES = ["OFFICE", "FACTORY", "VILLAGE"] as const;
export type SiteMode = (typeof SITE_MODES)[number];

export const ID_DOCUMENT_TYPES = ["NATIONAL_ID", "DRIVER_LICENSE", "PASSPORT", "OTHER"] as const;
export type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number];

export const VISIT_PURPOSES = [
  "INTERVIEW",
  "MEETING",
  "DELIVERY",
  "MAINTENANCE",
  "CONTRACTOR_WORK",
  "CARGO",
  "GUEST",
  "FOOD_DELIVERY",
  "OTHER",
] as const;
export type VisitPurpose = (typeof VISIT_PURPOSES)[number];

export const HIGH_RISK_WORKS = [
  "HOT_WORK",
  "CONFINED_SPACE",
  "WORKING_AT_HEIGHTS",
  "ELECTRICAL",
  "CHEMICAL",
  "LIFTING",
] as const;
export type HighRiskWork = (typeof HIGH_RISK_WORKS)[number];

export const VEHICLE_TYPES = [
  "CAR",
  "MOTORCYCLE",
  "PICKUP",
  "VAN",
  "TRUCK_4W",
  "TRUCK_6W",
  "TRUCK_10W",
  "TRAILER",
  "OTHER",
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const PPE_ITEMS = [
  "ppeHelmet",
  "ppeSafetyShoes",
  "ppeReflectiveVest",
  "ppeSafetyGlasses",
  "ppeEarProtection",
  "ppeGloves",
] as const;
export type PpeItem = (typeof PPE_ITEMS)[number];

export type StampStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
