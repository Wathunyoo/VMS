import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** ข้อมูลตัวอย่าง — ใส่ในองค์กร SEED_ORG (ค่าเริ่มต้น "main"; สร้างให้ถ้ายังไม่มี) */
async function main() {
  const slug = process.env.SEED_ORG ?? "main";
  const org = await prisma.organization.upsert({
    where: { slug },
    update: {},
    create: { slug, name: slug === "main" ? "องค์กรของฉัน" : `องค์กรตัวอย่าง (${slug})`, status: "ACTIVE" },
  });
  const organizationId = org.id;
  await prisma.retentionSetting.upsert({ where: { organizationId }, update: {}, create: { organizationId } });

  const office = await prisma.site.upsert({
    where: { organizationId_code: { organizationId, code: "HQ-TOWER" } },
    update: {},
    create: {
      organizationId,
      code: "HQ-TOWER",
      name: "อาคาร Sathorn Square Tower",
      mode: "OFFICE",
      defaultMaxStayMinutes: 480,
    },
  });

  const tenants = [
    { name: "บจก. อัลฟ่า เทคโนโลยี", floor: "12", unit: "1201" },
    { name: "บจก. สยาม ลอว์ แอนด์ พาร์ทเนอร์", floor: "12", unit: "1205" },
    { name: "Beta Consulting (Thailand)", floor: "18", unit: "1801" },
    { name: "บมจ. แกมม่า ประกันภัย", floor: "25", unit: null },
  ];
  for (const t of tenants) {
    const tenant = await prisma.tenant.create({ data: { ...t, organizationId, siteId: office.id } });
    await prisma.host.createMany({
      data: [
        { organizationId, siteId: office.id, tenantId: tenant.id, fullName: `ต้อนรับ ${t.name}`, department: "Reception" },
        {
          organizationId,
          siteId: office.id,
          tenantId: tenant.id,
          fullName: `สมชาย ใจดี (${t.floor})`,
          department: "HR",
          email: "hr@example.com",
        },
      ],
    });
  }

  const factory = await prisma.site.upsert({
    where: { organizationId_code: { organizationId, code: "PLANT-RY" } },
    update: {},
    create: {
      organizationId,
      code: "PLANT-RY",
      name: "โรงงานระยอง (Plant 1)",
      mode: "FACTORY",
      defaultMaxStayMinutes: 600,
      inductionVersion: "SI-2026.1",
    },
  });

  await prisma.host.createMany({
    data: [
      { organizationId, siteId: factory.id, fullName: "วิชัย ปลอดภัย", department: "Safety (จป.)" },
      { organizationId, siteId: factory.id, fullName: "สุนีย์ คลังสินค้า", department: "Warehouse" },
      { organizationId, siteId: factory.id, fullName: "ประเสริฐ ซ่อมบำรุง", department: "Maintenance" },
    ],
  });

  await prisma.loadingBay.createMany({
    skipDuplicates: true,
    data: [
      { organizationId, siteId: factory.id, code: "LB-01", name: "รับวัตถุดิบ", zone: "Warehouse A" },
      { organizationId, siteId: factory.id, code: "LB-02", name: "ส่งสินค้าสำเร็จรูป", zone: "Warehouse B" },
      { organizationId, siteId: factory.id, code: "CHEM-1", name: "คลังสารเคมี", zone: "Restricted" },
    ],
  });

  console.log(`Seeded org "${slug}":`, office.name, "/", factory.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
