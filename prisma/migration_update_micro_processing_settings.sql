-- This migration ensures the MicroProcessingSettings table has all the fields defined in the Prisma schema

-- First, check if the MicroProcessingSettings table exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_name = 'MicroProcessingSettings'
  ) THEN
    -- Create the table if it doesn't exist
    CREATE TABLE "MicroProcessingSettings" (
      "id" TEXT PRIMARY KEY,
      "cryptoId" TEXT UNIQUE,
      "enabled" BOOLEAN DEFAULT false,
      "sellPercentage" DOUBLE PRECISION DEFAULT 0.5,
      "tradeByShares" DOUBLE PRECISION DEFAULT 0,
      "tradeByValue" BOOLEAN DEFAULT false,
      "totalValue" DOUBLE PRECISION DEFAULT 0,
      "websocketProvider" TEXT DEFAULT 'kraken',
      "tradingPlatform" TEXT DEFAULT 'kraken',
      "purchasePrice" DOUBLE PRECISION,
      "lastBuyPrice" DOUBLE PRECISION,
      "lastBuyShares" DOUBLE PRECISION,
      "lastBuyTimestamp" TIMESTAMP,
      "processingStatus" TEXT,
      "testMode" BOOLEAN DEFAULT false,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  END IF;
END $$;

-- Check and add each column if it doesn't exist
DO $$ 
BEGIN
  -- Check for enabled column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'enabled'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "enabled" BOOLEAN DEFAULT false;
  END IF;

  -- Check for sellPercentage column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'sellPercentage'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "sellPercentage" DOUBLE PRECISION DEFAULT 0.5;
  END IF;

  -- Check for tradeByShares column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'tradeByShares'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "tradeByShares" DOUBLE PRECISION DEFAULT 0;
  END IF;

  -- Check for tradeByValue column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'tradeByValue'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "tradeByValue" BOOLEAN DEFAULT false;
  END IF;

  -- Check for totalValue column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'totalValue'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "totalValue" DOUBLE PRECISION DEFAULT 0;
  END IF;

  -- Check for websocketProvider column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'websocketProvider'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "websocketProvider" TEXT DEFAULT 'kraken';
  END IF;

  -- Check for tradingPlatform column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'tradingPlatform'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "tradingPlatform" TEXT DEFAULT 'kraken';
  END IF;

  -- Check for purchasePrice column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'purchasePrice'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "purchasePrice" DOUBLE PRECISION;
  END IF;

  -- Check for lastBuyPrice column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'lastBuyPrice'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "lastBuyPrice" DOUBLE PRECISION;
  END IF;

  -- Check for lastBuyShares column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'lastBuyShares'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "lastBuyShares" DOUBLE PRECISION;
  END IF;

  -- Check for lastBuyTimestamp column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'lastBuyTimestamp'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "lastBuyTimestamp" TIMESTAMP;
  END IF;

  -- Check for processingStatus column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'processingStatus'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "processingStatus" TEXT;
  END IF;

  -- Check for testMode column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'testMode'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "testMode" BOOLEAN DEFAULT false;
  END IF;

  -- Check for createdAt column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'createdAt'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  END IF;

  -- Check for updatedAt column
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- Add foreign key constraint if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'MicroProcessingSettings_cryptoId_fkey' 
    AND table_name = 'MicroProcessingSettings'
  ) THEN
    -- Add the foreign key constraint
    ALTER TABLE "MicroProcessingSettings" 
    ADD CONSTRAINT "MicroProcessingSettings_cryptoId_fkey" 
    FOREIGN KEY ("cryptoId") 
    REFERENCES "Crypto"(id) 
    ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure the cryptoId column is unique
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'MicroProcessingSettings_cryptoId_key' 
    AND table_name = 'MicroProcessingSettings'
  ) THEN
    -- Add the unique constraint
    ALTER TABLE "MicroProcessingSettings" 
    ADD CONSTRAINT "MicroProcessingSettings_cryptoId_key" 
    UNIQUE ("cryptoId");
  END IF;
END $$;