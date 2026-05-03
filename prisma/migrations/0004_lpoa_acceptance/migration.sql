ALTER TABLE "User"
ADD COLUMN "lpoaVersion" TEXT,
ADD COLUMN "lpoaAcceptedAt" TIMESTAMP(3),
ADD COLUMN "lpoaUserAgent" TEXT,
ADD COLUMN "lpoaAcceptanceIp" TEXT;
