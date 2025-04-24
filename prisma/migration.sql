-- This migration ensures the MicroProcessingSettings table has the correct foreign key relationship
-- with the Crypto table. The cryptoId column should already exist, but we're ensuring the
-- foreign key constraint is properly set up.

-- First, check if the cryptoId column exists in the MicroProcessingSettings table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'MicroProcessingSettings' 
    AND column_name = 'cryptoId'
  ) THEN
    -- Add the cryptoId column if it doesn't exist
    ALTER TABLE "MicroProcessingSettings" ADD COLUMN "cryptoId" TEXT;
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