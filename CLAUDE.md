# CLAUDE.md — มานะ (VMS: Visitor Management System)

ระบบลงทะเบียนผู้ติดต่อแบบ multi-tenant SaaS สำหรับ อาคารสำนักงาน · โรงงาน · หมู่บ้าน/คอนโด
รายละเอียดฟีเจอร์ทั้งหมดอยู่ใน `README.md` — อ่านส่วนที่เกี่ยวข้องก่อนแก้ฟีเจอร์นั้น

## ⚠️ ข้อมูลจริง — อ่านก่อนทำอะไร
- เครื่องนี้เป็นทั้งเครื่อง dev และเครื่องที่เปิดระบบให้ลูกค้าใช้จริง (`npm run online`)
- `.pgdata/` = ฐานข้อมูลจริงของลูกค้า · `storage/` = รูปใบหน้า/บัตร/สลิปจริง (ข้อมูลส่วนบุคคล PDPA) · `.env*` = secrets
- **ห้าม**: `prisma migrate reset`, `prisma db push --force-reset`, ลบ/แก้ไฟล์ใน `.pgdata/` `storage/` `.env*`, อ่าน `.env` แล้วพิมพ์ค่าออกมา
- ห้ามรัน `npm run test:billing` ถ้ามีลูกค้าใช้งานอยู่ (กินเลขที่เอกสารจริง) · `test:backup` ปลอดภัย (ใช้ DB ชั่วคราว)
- ก่อนสร้าง migration ใหม่ ให้ `npm run backup:now` ก่อนเสมอ

## Tech Stack
Next.js 16 (App Router, Server Actions) · TypeScript strict · Prisma 7 + PostgreSQL (embedded-postgres ในเครื่อง / Docker บน server) · Zod · Tailwind v4 + shadcn/ui · Tesseract.js (OCR ในเบราว์เซอร์) · LINE Messaging API

## สถาปัตยกรรม (Clean Architecture)
```
src/domain/          กฎธุรกิจล้วน — ห้าม import Prisma/Next/infrastructure
src/application/     use case + ports (interfaces) + zod schema
src/infrastructure/  adapter: Prisma repositories, auth, LINE, backup, billing, security
src/features/        UI + server actions แยกตามฟีเจอร์
src/app/             routes บาง ๆ ประกอบ feature เข้าด้วยกัน
src/container.ts     composition root — ที่เดียวที่ผูก port กับ adapter
```
Dependency rule: `app → features → application → domain` · `infrastructure` implement ports ของ `application`
ฟีเจอร์ใหม่: เพิ่ม domain → use case + port → repository → ผูกใน `container.ts` → feature UI → route

## Multi-tenant — กฎที่ห้ามพลาด
- ทุกข้อมูลลูกค้าผูกกับ `organizationId` · ใช้ `db(orgId)` จาก `src/infrastructure/db/tenant.ts` เสมอ (บังคับ orgId ให้ทุก query ระดับบนสุด)
- **orgId มาจาก session เท่านั้น** (`requireStaff()` / `requireAdmin()` / `requirePlatformAdmin()`) — ห้ามรับ orgId จาก form, query string หรือ body
- `prisma` ตัวตรง (ไม่ผ่าน `db(orgId)`) ใช้ได้เฉพาะ: งานข้ามองค์กรของผู้ให้บริการ, scripts, และหน้าที่สิทธิ์มาจาก token สุ่ม (`/stamp/[token]`, `/g`, `/r`, LINE webhook, รูปผ่าน `?st=`)
- **nested create ไม่ผ่าน extension** → ต้องใส่ `organizationId` เองใน repository
- เพิ่มโมเดลใหม่ที่มี `organizationId` → ต้องเพิ่มชื่อใน `TENANT_MODELS` ใน `tenant.ts` ด้วย
- ทุก server action ต้องเรียก `requireStaff()` (หรือ require ที่เข้มกว่า) บรรทัดแรก — `src/proxy.ts` เป็นแค่ด่านแรก
- ค่าที่ unique ต้องเป็น unique *ภายในองค์กร* (`@@unique([organizationId, ...])`)

## กฎธุรกิจสำคัญ
- 1 องค์กร = 1 `siteMode` (OFFICE / FACTORY / VILLAGE) เปลี่ยนไม่ได้ — คำเรียกที่ต่างกันตามโหมดอยู่ที่ `src/domain/visit/labels.ts` (ห้าม hardcode ข้อความใน UI)
- โหมดหมู่บ้านใช้ตารางเดิม: บ้าน = `Tenant`, ลูกบ้าน = `Host`
- ทุกเหตุการณ์ของ Visit บันทึกลง `VisitEvent` พร้อม `actor`
- รายชื่อ/สถานที่ใช้ "ปิดใช้งาน" แทนการลบ เพื่อให้ประวัติครบ
- การตรวจฟอร์มทำฝั่ง server ที่ `src/application/check-in/form-rules.ts` เสมอ
- **Check-out ต้องทำได้เสมอ** แม้สิทธิ์ใช้งาน/สัญญาหมดอายุ
- PDPA: ไม่เก็บศาสนา/ที่อยู่/วันเกิดจากบัตร · เลขบัตรเก็บเป็น hash + แสดงแบบ mask · รูปอยู่ใน `storage/photos` (นอก `public/`) ตอบ 404 เมื่อไม่มีสิทธิ์ · ข้อมูลส่วนบุคคลใหม่ต้องถูกลบ/ไม่ระบุตัวตนโดย retention (`src/application/retention/`) ด้วย
- ไม่ส่งรูปใบหน้า/ข้อมูลชีวภาพออกไปบุคคลที่สาม (LINE, EasySlip ฯลฯ)
- เวลาแสดงผลเป็นเวลาไทย (Asia/Bangkok) · UI และข้อความผู้ใช้เป็นภาษาไทย

## คำสั่ง
```bash
npm run db:local        # เปิด PostgreSQL ในเครื่อง (.pgdata) — ต้องเปิดก่อน dev/test
npm run dev             # http://localhost:3000
npm run typecheck       # tsc --noEmit — รันทุกครั้งหลังแก้โค้ด
npx prisma migrate dev --name <ชื่อ>   # แล้วรีสตาร์ท dev server ให้ Prisma Client ใหม่มีผล
```
ไม่มี linter และไม่มี unit-test framework — การทดสอบเป็น script (ต้องเปิด DB ก่อน):

| แก้ส่วนไหน | รัน |
|---|---|
| query / repository / server action / auth (ทุกครั้งที่แตะข้อมูล) | `npm run test:isolation` (+ `-- --http` ถ้าเปิด dev server อยู่) |
| หมู่บ้าน, แบบฟอร์ม, รายชื่อ, รายงาน, PDPA | `npm run test:features` |
| ลูกค้า / สัญญา (`/platform/customers`) | `npm run test:customers` |
| แจ้งแขกล่วงหน้า / QR | `npm run test:invite` |
| สำรอง/กู้คืนข้อมูล | `npm run test:backup` |
| ตรวจสลิป | `npm run test:slip` |
| OCR ป้ายทะเบียน / เครื่องอ่านบัตร | `npm run test:plate` / `npm run test:cardreader` |

ก่อน deploy: `typecheck` + `test:isolation -- --http` ต้องผ่านทั้งหมด · deploy: `bash deploy/deploy.sh <IP>`

## Workflow
- งานที่แตะหลายไฟล์หรือ schema → เสนอแผนก่อนลงมือ
- แก้ `schema.prisma` → สร้าง migration (ห้ามแก้ migration เก่าที่มีอยู่แล้ว)
- เพิ่มคำสั่ง/ฟีเจอร์/ค่า `.env` ใหม่ → อัปเดต `README.md` และ `.env.example` (ห้ามใส่ค่าจริง)
- commit ทีละเรื่องเมื่องานเสร็จและ typecheck ผ่าน

## Next.js Version Rules
@AGENTS.md
