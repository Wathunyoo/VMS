/**
 * สร้างบัญชีผู้ดูแลระบบคนแรกขององค์กรเริ่มต้น (ถ้ายังไม่มี)
 *   npm run user:admin [-- --org main]
 * ใช้รหัสผ่านจาก INITIAL_ADMIN_PASSWORD ใน .env — ระบบจะบังคับเปลี่ยนเมื่อ login ครั้งแรก
 * (องค์กรใหม่ให้ใช้ npm run org:create แทน)
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "@/infrastructure/db/prisma";
import { scryptPasswords } from "@/infrastructure/security/password";

async function main() {
  const { values } = parseArgs({ options: { org: { type: "string", default: "main" } } });
  const org = await prisma.organization.findUnique({ where: { slug: values.org! } });
  if (!org) throw new Error(`ไม่พบองค์กร "${values.org}"`);

  const username = (process.env.INITIAL_ADMIN_USERNAME ?? "admin").toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!password || password.length < 8) throw new Error("ตั้งค่า INITIAL_ADMIN_PASSWORD (อย่างน้อย 8 ตัว) ใน .env ก่อน");

  const exists = await prisma.staffUser.findUnique({
    where: { organizationId_username: { organizationId: org.id, username } },
  });
  if (exists) {
    console.log(`มีบัญชี "${username}" ในองค์กร ${org.slug} อยู่แล้ว — ไม่ได้สร้างใหม่`);
    return;
  }
  await prisma.staffUser.create({
    data: {
      organizationId: org.id,
      username,
      fullName: "ผู้ดูแลระบบ",
      role: "ADMIN",
      passwordHash: await scryptPasswords.hash(password),
      mustChangePassword: true,
    },
  });
  console.log(`สร้างบัญชี "${username}" ในองค์กร ${org.slug} แล้ว — รหัสผ่านเริ่มต้นอยู่ใน .env (INITIAL_ADMIN_PASSWORD)`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
