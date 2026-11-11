import "server-only";
import { customersDeps } from "@/container";
import { computeAccess } from "@/domain/billing/access";
import { contractStatus, contractStatusText, contractYmd } from "@/domain/org/contract";
import { SITE_TYPE_LABEL } from "@/domain/visit/labels";
import { ACCESS_LABEL } from "@/features/billing/view";
import type { CustomerView } from "./customer-view";

const fmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });

/** ลูกค้าทุกองค์กรสำหรับหน้า "ลูกค้า" และไฟล์ส่งออก — เรียกหลัง requirePlatformAdmin เท่านั้น */
export async function loadCustomerViews(now = new Date()): Promise<CustomerView[]> {
  const deps = customersDeps();
  const rows = await deps.repo.list();
  return rows.map((r) => {
    const access = computeAccess({ status: r.status, trialEndsAt: r.trialEndsAt, paidUntil: r.paidUntil, checkInPointLimit: 0 }, now);
    const contract = contractStatus(r.contractEndsAt, now);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      mode: r.mode,
      modeLabel: r.mode ? SITE_TYPE_LABEL[r.mode] : "—",
      status: r.status,
      accessLabel: ACCESS_LABEL[access.state] + (access.until ? ` ถึง ${fmt.format(access.until)}` : ""),
      canCheckIn: access.canCheckIn,
      onboarded: !!r.onboardedAt,
      contactEmail: r.contactEmail,
      pointLimit: r.pointLimit,
      activePoints: r.activePoints,
      houseLimit: r.houseLimit,
      activeHouses: r.activeHouses,
      isVillage: r.mode === "VILLAGE",
      contractEndYmd: r.contractEndsAt ? contractYmd(r.contractEndsAt) : "",
      contractEndText: r.contractEndsAt ? fmt.format(r.contractEndsAt) : null,
      contractState: contract.state,
      contractDaysLeft: contract.daysLeft,
      contractLabel: contractStatusText(contract),
      billing: r.billing,
      admins: r.admins,
      sites: r.sites,
      createdText: fmt.format(r.createdAt),
      lastVisitText: r.lastVisitAt ? fmt.format(r.lastVisitAt) : null,
      isPlatform: r.slug === deps.platformOrgSlug,
    };
  });
}
