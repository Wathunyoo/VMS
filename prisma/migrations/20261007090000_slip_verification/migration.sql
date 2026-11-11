-- ตรวจสลิปอัตโนมัติ
ALTER TABLE "Invoice" ADD COLUMN "slipHash" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "slipTransRef" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "slipCheck" JSONB;

CREATE INDEX "Invoice_slipHash_idx" ON "Invoice"("slipHash");
CREATE INDEX "Invoice_slipTransRef_idx" ON "Invoice"("slipTransRef");

-- รายการโอนหนึ่งรายการ / ไฟล์สลิปหนึ่งไฟล์ ใช้ปิดใบแจ้งหนี้ได้ใบเดียว (กันอนุมัติซ้อนพร้อมกัน)
CREATE UNIQUE INDEX "Invoice_paid_slipTransRef_key" ON "Invoice"("slipTransRef") WHERE "status" = 'PAID' AND "slipTransRef" IS NOT NULL;
CREATE UNIQUE INDEX "Invoice_paid_slipHash_key" ON "Invoice"("slipHash") WHERE "status" = 'PAID' AND "slipHash" IS NOT NULL;
