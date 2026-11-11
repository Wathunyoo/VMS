# ติดตั้ง VMS บน Windows (สำหรับ Claude Code บนเครื่อง Windows)

ชุดนี้คัดลอกมาจากเครื่อง Mac โดย **ไม่มี** สิ่งเหล่านี้ (ต้องสร้างใหม่บน Windows):

- `node_modules/`, `.next/`, `src/generated/` — สร้างใหม่ด้วย `npm install` / `npm run build`
- `.pgdata/` — ฐานข้อมูล (เริ่มใหม่ว่างเปล่า ไม่มีข้อมูลผู้มาติดต่อจริง)
- `storage/` — ภาพใบหน้า/ป้าย/บัตร (PDPA: ไม่นำออกจากเครื่องเดิม)
- `.env` — รหัสลับทั้งหมด (ต้องสร้างใหม่ ห้ามคัดลอกผ่านแชทหรืออีเมล)

ไฟล์ `*.command` ใช้ได้เฉพาะ Mac — บน Windows ให้ใช้ไฟล์ `.bat` ที่สร้างตามขั้นที่ 5

## สิ่งที่ต้องมี

- Windows 10/11 แบบ 64-bit
- Node.js 24 LTS (https://nodejs.org) — ติดตั้งแบบปกติ แล้วเปิด Terminal ใหม่
- เบราว์เซอร์ Chrome หรือ Edge (กล้องใช้ได้ที่ `http://localhost` หรือ https เท่านั้น)

## ข้อความสำหรับสั่ง Claude Code บน Windows

แตกไฟล์ zip ไว้ในโฟลเดอร์ เช่น `C:\VMS` แล้วเปิด Claude Code ในโฟลเดอร์นั้น พิมพ์:

> อ่าน WINDOWS-SETUP.md แล้วติดตั้งโปรแกรม VMS ให้ใช้งานบน Windows เครื่องนี้ตามขั้นตอนในไฟล์ อธิบายเป็นภาษาไทยแบบง่าย และห้ามแสดงรหัสผ่านหรือรหัสลับในแชท

## ขั้นตอน (สำหรับ Claude Code)

1. ตรวจ `node -v` (ต้อง ≥ 24) และ `npm -v`
2. ใน `package.json` ส่วน `allowScripts` เพิ่มแพ็กเกจฐานข้อมูลของ Windows
   (`@embedded-postgres/windows-x64` เวอร์ชันเดียวกับ darwin-arm64 ที่มีอยู่) แล้ว `npm install`
   — ตรวจว่า `node_modules/@embedded-postgres/windows-x64` ถูกติดตั้ง
3. สร้าง `.env` จาก `.env.example`:
   - `DATABASE_URL="postgresql://vms:vms@localhost:5432/vms"`
   - สุ่มค่าใหม่สำหรับ `PASS_TOKEN_SECRET`, `ID_HASH_SECRET`, `BACKUP_KEY` (เช่น `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`)
   - `INITIAL_ADMIN_USERNAME=admin` และสุ่ม `INITIAL_ADMIN_PASSWORD` — เขียนลงไฟล์เท่านั้น ไม่แสดงในแชท
     บอกผู้ใช้ให้ดูเองด้วย `findstr INITIAL_ADMIN_PASSWORD .env`
   - `PLATFORM_ORG_SLUG=main`
   - `BACKUP_DIR` = `%USERPROFILE%\VMS-Backups` (เขียนเป็น path เต็ม)
   - เว้นว่าง LINE / EasySlip / SMTP / Cloudflare ไว้ก่อน (ระบบทำงานได้โดยไม่ต้องมี)
4. เปิดฐานข้อมูล `npm run db:local` (ค้างไว้ในอีกหน้าต่าง) แล้วรัน
   `npx prisma migrate deploy` → `npm run user:admin` → (ถ้าต้องการข้อมูลตัวอย่าง) `npm run db:seed`
   - ถ้า `scripts/local-db.mjs` หาโฟลเดอร์ผิดบน Windows (`new URL(...).pathname` ให้ค่า `/C:/...`)
     ให้แก้เป็น `fileURLToPath(new URL("../.pgdata", import.meta.url))` จาก `node:url`
5. สร้าง `เริ่มโปรแกรม.bat` (บันทึกเป็น UTF-8 และใส่ `chcp 65001` บรรทัดแรก) ให้:
   เปิด `npm run db:local` ในหน้าต่างแยก → รอ 5 วินาที → เปิดเบราว์เซอร์ `http://localhost:3000/check-in` → `npm run dev`
6. ทดสอบ: `npm run typecheck`, `npm run test:isolation`, `npm run test:features`, `npm run test:backup`
   (ทดสอบ `test:plate` ต้องใช้ฟอนต์ไทยในเครื่อง — ถ้าไม่ผ่านเฉพาะส่วนภาพจำลอง ไม่ใช่ปัญหาของระบบ)
7. login ที่ `http://localhost:3000/login` ด้วย admin แล้วลองลงทะเบียนผู้มาติดต่อ 1 ราย

## ข้อควรระวัง

- **LINE**: อย่าผูก LINE OA เดียวกันกับทั้ง Mac และ Windows พร้อมกัน — Webhook ชี้ได้ที่เดียว
  ถ้าจะใช้ LINE บน Windows ให้รัน `node scripts/setup-line.mjs` บนเครื่องนั้นและเปลี่ยน Webhook URL
- **โหมดออนไลน์** (`npm run online`) ต้องติดตั้ง `cloudflared` สำหรับ Windows ก่อน และสคริปต์ปัจจุบันหา cloudflared
  ด้วยคำสั่ง `which` (มีเฉพาะ Mac/Linux) — ต้องปรับให้ใช้ `where` บน Windows
- ข้อมูลบน Windows แยกจาก Mac — ถ้าต้องการย้ายข้อมูลจริง ใช้ไฟล์สำรอง (`npm run backup:restore`) และขอความยินยอมเรื่อง PDPA ก่อน
