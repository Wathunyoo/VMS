/**
 * สร้างลูกค้า (องค์กร) + บัญชีผู้ดูแลคนแรก — สำหรับผู้ให้บริการ (ใช้แทนหน้า “ลูกค้า” ได้)
 *   npm run org:create -- --slug acme --name "หมู่บ้านสวนสวย" --mode VILLAGE --email a@b.com --points 2 --houses 120 \
 *     --legal-name "นิติบุคคลหมู่บ้านสวนสวย" --tax-id 0105556000009 --address "..." [--branch 00001] [--admin admin] [--status TRIAL|ACTIVE] [--days 30]
 * รหัสผ่านชั่วคราวแสดงครั้งเดียวในหน้าจอนี้ — ผู้ดูแลจะถูกบังคับเปลี่ยนเมื่อ login ครั้งแรก
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { createCustomer } from "@/application/platform/customers.usecase";
import { customersDeps } from "@/container";
import { prisma } from "@/infrastructure/db/prisma";

async function main() {
  const { values } = parseArgs({
    options: {
      slug: { type: "string" },
      name: { type: "string" },
      mode: { type: "string" },
      admin: { type: "string", default: "admin" },
      status: { type: "string", default: "TRIAL" },
      days: { type: "string", default: "30" },
      email: { type: "string" },
      points: { type: "string", default: "1" },
      houses: { type: "string" },
      "legal-name": { type: "string" },
      "tax-id": { type: "string" },
      branch: { type: "string", default: "สำนักงานใหญ่" },
      address: { type: "string" },
    },
  });
  const r = await createCustomer(
    {
      name: values.name ?? "",
      slug: values.slug ?? "",
      mode: (values.mode ?? "").toUpperCase(),
      adminUsername: values.admin,
      contactEmail: values.email,
      pointLimit: Number(values.points),
      houseLimit: values.houses == null ? null : Number(values.houses),
      legalName: values["legal-name"],
      taxId: values["tax-id"],
      branch: values.branch,
      address: values.address,
      plan: values.status === "ACTIVE" ? "ACTIVE" : "TRIAL",
      trialDays: Number(values.days),
    },
    customersDeps(),
  );
  console.log(`
สร้างลูกค้าแล้ว
  รหัสองค์กร:    ${r.slug}
  ผู้ดูแล:       ${r.username}
  รหัสชั่วคราว:  ${r.tempPassword}   ← แสดงครั้งเดียว ส่งให้ลูกค้าแบบปลอดภัย
  ลิงก์ login:   ${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}/login?org=${r.slug}
`);
}

main()
  .catch((e) => {
    console.error("ไม่สำเร็จ:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
