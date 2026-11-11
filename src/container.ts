import "server-only";
import { randomInt } from "node:crypto";
import type { AuthDeps } from "@/application/auth/auth.usecase";
import type { CheckInDeps } from "@/application/check-in/check-in.usecase";
import type { CheckOutDeps } from "@/application/check-out/check-out.usecase";
import type { HostLineDeps } from "@/application/host-line/host-line.usecase";
import type { RetentionDeps } from "@/application/retention/retention.usecase";
import type { BillingDeps, PlatformDeps } from "@/application/billing/billing.usecase";
import type { DeviceDeps } from "@/application/billing/devices.usecase";
import type { ReportDeps } from "@/application/reports/report.usecase";
import { prismaReportRepository } from "@/infrastructure/repositories/prisma-report.repository";
import type { DirectoryAdminDeps } from "@/application/directory/directory-admin.usecase";
import { prismaDirectoryAdminRepository } from "@/infrastructure/repositories/prisma-directory-admin.repository";
import type { FormSettingsDeps } from "@/application/settings/form-settings.usecase";
import { prismaFormRepository } from "@/infrastructure/repositories/prisma-form.repository";
import type { OnboardingDeps } from "@/application/onboarding/onboarding.usecase";
import type { SlipCheckDeps } from "@/application/billing/slip-check.usecase";
import { easySlipProvider } from "@/infrastructure/billing/easyslip";
import { payeeAccounts, platformBillingEmail, platformOrgSlug } from "@/infrastructure/billing/seller";
import type { CustomersDeps } from "@/application/platform/customers.usecase";
import { prismaCustomersRepository } from "@/infrastructure/repositories/prisma-customers.repository";
import { localSlipQrReader } from "@/infrastructure/billing/slip-qr-reader";
import { localSlipStorage } from "@/infrastructure/billing/slip-storage";
import {
  prismaBillingRepository,
  prismaDeviceRepository,
  prismaPlatformBillingRepository,
} from "@/infrastructure/repositories/prisma-billing.repository";
import type { StampDeps } from "@/application/stamp/stamp.usecase";
import { smtpMailer } from "@/infrastructure/notify/mailer";
import { prismaOnboardingRepository } from "@/infrastructure/repositories/prisma-onboarding.repository";
import { randomTokens } from "@/infrastructure/security/tokens";
import { lineMessenger } from "@/infrastructure/line/line-messenger";
import { lineNotifier } from "@/infrastructure/notify/line-notifier";
import { prismaCheckOutRepository, stampTokenRepository } from "@/infrastructure/repositories/prisma-checkout.repository";
import { prismaHostLineRepository } from "@/infrastructure/repositories/prisma-host-line.repository";
import { prismaRetentionRepository } from "@/infrastructure/repositories/prisma-retention.repository";
import { prismaOrganizationRepository, prismaStaffRepository } from "@/infrastructure/repositories/prisma-staff.repository";
import { prismaVisitRepository } from "@/infrastructure/repositories/prisma-visit.repository";
import { cryptoSecurity } from "@/infrastructure/security/crypto-security";
import { verifyPassToken } from "@/infrastructure/security/pass-token";
import { scryptPasswords } from "@/infrastructure/security/password";
import { localPhotoDeleter, localPhotoStorage } from "@/infrastructure/storage/local-photo-storage";
import { appUrl } from "@/lib/app-url";
import { randomBytes } from "node:crypto";
import type { ResidentInviteDeps, StaffInviteDeps } from "@/application/guest-invite/guest-invite.usecase";
import { prismaStaffInviteRepository, publicInviteRepository } from "@/infrastructure/repositories/prisma-guest-invite.repository";
import { createResidentToken, lineUserTag, verifyResidentToken } from "@/infrastructure/security/resident-token";
import { RESIDENT_LINK_TTL_MS } from "@/domain/invite/guest-invite";

/**
 * Composition root — สลับ adapter (S3, SMS, ...) ได้จากจุดเดียว
 * dependency ที่แตะข้อมูลลูกค้าเป็นฟังก์ชันของ organizationId เสมอ (multi-tenant)
 * — ค่า orgId ต้องมาจาก session ของผู้ใช้ (requireStaff) เท่านั้น ห้ามรับจาก input
 */

export const checkInDeps = (orgId: string): CheckInDeps => ({
  visits: prismaVisitRepository(orgId),
  photos: localPhotoStorage,
  security: cryptoSecurity,
  notifier: lineNotifier,
  form: prismaFormRepository(orgId),
  appUrl: appUrl(),
  invites: prismaStaffInviteRepository(orgId),
});

/** แจ้งแขกล่วงหน้า — หน้าของลูกบ้าน/แขก (สิทธิ์มาจากลิงก์ที่เซ็นแล้ว / token สุ่มของแขก) */
export const residentInviteDeps = (): ResidentInviteDeps => ({
  invites: publicInviteRepository,
  verifyResidentToken,
  lineUserTag,
  newInviteToken: () => randomBytes(18).toString("base64url"),
  appUrl: appUrl(),
});

export const staffInviteDeps = (orgId: string): StaffInviteDeps => ({ invites: prismaStaffInviteRepository(orgId) });

const residentLink = (hostId: string, lineUserId: string, now: Date) =>
  `${appUrl()}/r/${createResidentToken(hostId, lineUserId, new Date(now.getTime() + RESIDENT_LINK_TTL_MS))}`;

export const formSettingsDeps = (orgId: string): FormSettingsDeps => ({ repo: prismaFormRepository(orgId) });

export const directoryAdminDeps = (orgId: string): DirectoryAdminDeps => ({ repo: prismaDirectoryAdminRepository(orgId) });

export const reportDeps = (orgId: string): ReportDeps => ({ repo: prismaReportRepository(orgId) });

export const checkOutDeps = (orgId: string): CheckOutDeps => ({
  visits: prismaCheckOutRepository(orgId),
  security: cryptoSecurity,
  verifyPassToken,
});

export const retentionDeps = (orgId: string): RetentionDeps => ({
  repo: prismaRetentionRepository(orgId),
  photos: localPhotoDeleter,
});

const randomCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

export const hostLineDeps = (orgId: string): HostLineDeps => ({
  hosts: prismaHostLineRepository(orgId),
  line: lineMessenger,
  randomCode,
});

/** LINE webhook — ระบุองค์กรจากรหัสเชื่อมต่อ จึงไม่ผูกองค์กรล่วงหน้า */
export const hostLineWebhookDeps: HostLineDeps = {
  hosts: prismaHostLineRepository(null),
  line: lineMessenger,
  randomCode,
  residentLink,
};

/** หน้า E-Stamp ของ Host — สิทธิ์มาจาก stamp token */
export const stampDeps: StampDeps = { visits: stampTokenRepository };

export const authDeps: AuthDeps = {
  orgs: prismaOrganizationRepository,
  users: prismaStaffRepository,
  passwords: scryptPasswords,
};

/** สมัครใช้งานเอง — ยังไม่มีองค์กร จึงไม่ผูกองค์กร */
/** ลูกค้า (องค์กร) — ผู้ให้บริการสร้างให้ตอนติดตั้ง */
export const customersDeps = (): CustomersDeps => ({
  repo: prismaCustomersRepository,
  passwords: scryptPasswords,
  platformOrgSlug: platformOrgSlug(),
});

export const onboardingDeps = (orgId: string): OnboardingDeps => ({ repo: prismaOnboardingRepository(orgId) });

/** ตรวจสลิป: อ่าน QR ในเครื่องเสมอ · ตรวจกับธนาคารเมื่อตั้ง EASYSLIP_API_KEY */
const slipCheckDeps = (): SlipCheckDeps => {
  const key = process.env.EASYSLIP_API_KEY?.trim();
  return { qr: localSlipQrReader, provider: key ? easySlipProvider(key) : null, payee: payeeAccounts() };
};

/** อนุมัติอัตโนมัติเมื่อสลิปผ่านการตรวจกับธนาคาร (ปิดได้ด้วย SLIP_AUTO_APPROVE=false) */
const slipAutoApprove = () => !!process.env.EASYSLIP_API_KEY?.trim() && process.env.SLIP_AUTO_APPROVE?.trim() !== "false";

export const billingDeps = (orgId: string): BillingDeps => ({
  repo: prismaBillingRepository(orgId),
  devices: prismaDeviceRepository(orgId),
  slips: localSlipStorage,
  mailer: smtpMailer,
  platformEmail: platformBillingEmail(),
  appUrl: appUrl(),
  slipCheck: slipCheckDeps(),
  autoApprove: slipAutoApprove() ? platformDeps() : null,
});

export const deviceDeps = (orgId: string): DeviceDeps => ({
  repo: prismaBillingRepository(orgId),
  devices: prismaDeviceRepository(orgId),
  tokens: randomTokens,
});

/** ผู้ให้บริการตรวจสลิป — ข้ามองค์กร */
export const platformDeps = (): PlatformDeps => ({
  repo: prismaPlatformBillingRepository,
  mailer: smtpMailer,
  appUrl: appUrl(),
  slips: localSlipStorage,
  slipCheck: slipCheckDeps(),
});
