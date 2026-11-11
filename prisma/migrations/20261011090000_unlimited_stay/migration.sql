-- อยู่ได้ไม่จำกัดเวลา (null)
ALTER TABLE "Site" ALTER COLUMN "defaultMaxStayMinutes" DROP NOT NULL;
ALTER TABLE "Visit" ALTER COLUMN "expectedCheckOutAt" DROP NOT NULL;
