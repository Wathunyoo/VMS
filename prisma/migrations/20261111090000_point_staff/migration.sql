-- จุด Check-in สร้างล่วงหน้าได้ (ยังไม่มีเครื่อง) + เจ้าหน้าที่ประจำจุด
ALTER TABLE "CheckInPoint" ALTER COLUMN "tokenHash" DROP NOT NULL;

ALTER TABLE "StaffUser" ADD COLUMN "checkInPointId" TEXT;
CREATE INDEX "StaffUser_checkInPointId_idx" ON "StaffUser"("checkInPointId");
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_checkInPointId_fkey" FOREIGN KEY ("checkInPointId") REFERENCES "CheckInPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
