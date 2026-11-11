import { notFound } from "next/navigation";
import type { CustomValue } from "@/domain/form/form-config";
import { ID_TYPE_LABEL, PURPOSE_LABEL, VEHICLE_TYPE_LABEL, visitingText } from "@/domain/visit/labels";
import { UNLIMITED_STAY_LABEL } from "@/domain/visit/stay";
import { PPE_ITEMS } from "@/domain/visit/types";
import { PassPreview } from "@/features/pass/components/pass-preview";
import type { PassViewModel } from "@/features/pass/pass-view-model";
import { getVisitForPass } from "@/infrastructure/repositories/prisma-directory.repository";
import { createPassToken } from "@/infrastructure/security/pass-token";
import { requireOperator } from "@/infrastructure/auth/session";
import { formSettingsDeps } from "@/container";

export const dynamic = "force-dynamic";

/** ช่องเพิ่มเติมที่ตั้งให้แสดงบนบัตร */
function passExtras(raw: unknown, ids: Set<string>): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return (raw as CustomValue[]).filter((c) => ids.has(c.id) && c.value).map((c) => ({ label: c.label, value: c.value }));
}

const fmt = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

export default async function PassPage({
  params,
  searchParams,
}: {
  params: Promise<{ visitId: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const staff = await requireOperator();
  const [{ visitId }, { print }] = await Promise.all([params, searchParams]);
  const [v, customFields] = await Promise.all([
    getVisitForPass(staff.organizationId, visitId),
    formSettingsDeps(staff.organizationId).repo.customFields(true),
  ]);
  if (!v) notFound();
  const passFieldIds = new Set(customFields.filter((f) => f.showOnPass).map((f) => f.id));

  const s = v.safetyCheck;
  const pass: PassViewModel = {
    passCode: v.passCode,
    qrToken: createPassToken({
      vid: v.id,
      pc: v.passCode,
      n: v.visitor.fullName.slice(0, 40),
      in: Math.floor(v.checkInAt.getTime() / 1000),
      exp: v.expectedCheckOutAt ? Math.floor(v.expectedCheckOutAt.getTime() / 1000) : 0, // 0 = ไม่จำกัดเวลา
    }),
    siteName: v.site.name,
    mode: v.mode,
    visitorName: v.visitor.fullName,
    company: v.visitor.company,
    idTypeLabel: ID_TYPE_LABEL[v.visitor.idType],
    idNumberMasked: v.visitor.idNumberMasked,
    facePhotoUrl: v.facePhotoUrl,
    purposeLabel: PURPOSE_LABEL[v.purpose],
    visiting: visitingText(v.mode, v.tenant, v.host?.department),
    hostName: v.host?.fullName ?? null,
    checkInText: fmt.format(v.checkInAt),
    validUntilText: v.expectedCheckOutAt ? fmt.format(v.expectedCheckOutAt) : UNLIMITED_STAY_LABEL,
    badgeNumber: v.badgeNumber,
    vehicle: v.vehicle
      ? {
          plate: [v.vehicle.plateNumber, v.vehicle.plateProvince].filter(Boolean).join(" "),
          typeLabel: VEHICLE_TYPE_LABEL[v.vehicle.vehicleType],
          bay: v.vehicle.loadingBay ? `${v.vehicle.loadingBay.code} ${v.vehicle.loadingBay.name}` : null,
        }
      : null,
    stampStatus: v.stampStatus,
    ppe: s ? PPE_ITEMS.filter((k) => s[k]) : [],
    highRiskWorks: s?.highRiskWorks ?? [],
    workPermitId: s?.workPermitId ?? null,
    inductionOk: s?.inductionCompleted ?? false,
    extras: passExtras(v.customValues, passFieldIds),
  };

  return (
    <main className="min-h-dvh bg-muted/40 p-4 md:p-8">
      <PassPreview pass={pass} autoPrint={print === "1"} />
    </main>
  );
}
