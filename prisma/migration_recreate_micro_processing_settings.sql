-- This migration recreates the MicroProcessingSettings table to ensure proper crypto relationship

-- First, backup existing data
CREATE TABLE IF NOT EXISTS "MicroProcessingSettings_Backup" AS 
SELECT * FROM "MicroProcessingSettings";

-- Drop the existing table
DROP TABLE IF EXISTS "MicroProcessingSettings";

-- Recreate the table with proper constraints
CREATE TABLE "MicroProcessingSettings" (
  "id" TEXT NOT NULL,
  "cryptoId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "sellPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "tradeByShares" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tradeByValue" BOOLEAN NOT NULL DEFAULT false,
  "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "websocketProvider" TEXT NOT NULL DEFAULT 'kraken',
  "tradingPlatform" TEXT NOT NULL DEFAULT 'kraken',
  "purchasePrice" DOUBLE PRECISION,
  "lastBuyPrice" DOUBLE PRECISION,
  "lastBuyShares" DOUBLE PRECISION,
  "lastBuyTimestamp" TIMESTAMP(3),
  "processingStatus" TEXT,
  "testMode" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MicroProcessingSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MicroProcessingSettings_cryptoId_key" UNIQUE ("cryptoId"),
  CONSTRAINT "MicroProcessingSettings_cryptoId_fkey" FOREIGN KEY ("cryptoId") REFERENCES "Crypto"("id") ON DELETE CASCADE
);

-- Restore valid data from backup
INSERT INTO "MicroProcessingSettings" 
SELECT b.* FROM "MicroProcessingSettings_Backup" b
JOIN "Crypto" c ON b."cryptoId" = c.id;

-- Log the results
DO $$
DECLARE
  backup_count INTEGER;
  restored_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO backup_count FROM "MicroProcessingSettings_Backup";
  SELECT COUNT(*) INTO restored_count FROM "MicroProcessingSettings";
  
  RAISE NOTICE 'Backed up % records, restored % valid records', 
    backup_count, restored_count;
END $$;