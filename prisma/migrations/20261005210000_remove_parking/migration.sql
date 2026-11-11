-- AlterTable
ALTER TABLE "Site" DROP COLUMN "parkingDailyCap",
DROP COLUMN "parkingFreeMinutes",
DROP COLUMN "parkingGraceMinutes",
DROP COLUMN "parkingRatePerHour";

-- AlterTable
ALTER TABLE "Visit" DROP COLUMN "parkingFee",
DROP COLUMN "parkingFreeMinutes";

