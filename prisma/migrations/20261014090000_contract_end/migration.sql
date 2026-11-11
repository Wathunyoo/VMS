-- วันสิ้นสุดสัญญา (ใช้แจ้งเตือนผู้ให้บริการให้ต่อสัญญา — ไม่ได้หยุดการใช้งานอัตโนมัติ)
ALTER TABLE "Organization" ADD COLUMN "contractEndsAt" TIMESTAMP(3);
