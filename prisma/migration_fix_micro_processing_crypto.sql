-- This migration ensures the MicroProcessingSettings table has the proper crypto relationship

-- First, check if the MicroProcessingSettings table exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_name = 'MicroProcessingSettings'
  ) THEN
    -- Check if the foreign key constraint exists
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
      
      RAISE NOTICE 'Added foreign key constraint MicroProcessingSettings_cryptoId_fkey';
    ELSE
      RAISE NOTICE 'Foreign key constraint MicroProcessingSettings_cryptoId_fkey already exists';
    END IF;
    
    -- Check if the unique constraint exists
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
      
      RAISE NOTICE 'Added unique constraint MicroProcessingSettings_cryptoId_key';
    ELSE
      RAISE NOTICE 'Unique constraint MicroProcessingSettings_cryptoId_key already exists';
    END IF;
    
    -- Verify that all MicroProcessingSettings records have a valid cryptoId
    RAISE NOTICE 'Checking for MicroProcessingSettings records with invalid cryptoId...';
    
    -- Create a temporary table to store invalid records
    CREATE TEMP TABLE invalid_settings AS
    SELECT ms.id, ms."cryptoId"
    FROM "MicroProcessingSettings" ms
    LEFT JOIN "Crypto" c ON ms."cryptoId" = c.id
    WHERE c.id IS NULL;
    
    -- Report the number of invalid records
    RAISE NOTICE 'Found % MicroProcessingSettings records with invalid cryptoId', 
      (SELECT COUNT(*) FROM invalid_settings);
    
    -- Delete invalid records if any exist
    IF (SELECT COUNT(*) FROM invalid_settings) > 0 THEN
      DELETE FROM "MicroProcessingSettings"
      WHERE id IN (SELECT id FROM invalid_settings);
      
      RAISE NOTICE 'Deleted % invalid MicroProcessingSettings records', 
        (SELECT COUNT(*) FROM invalid_settings);
    END IF;
    
    -- Drop the temporary table
    DROP TABLE invalid_settings;
    
    RAISE NOTICE 'MicroProcessingSettings table verification complete';
  ELSE
    RAISE NOTICE 'MicroProcessingSettings table does not exist';
  END IF;
END $$;