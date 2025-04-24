import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log(`[FIX-MICRO-PROCESSING] API handler started: ${req.method} request received`);
  
  try {
    // Get the user from Supabase auth
    console.log('[FIX-MICRO-PROCESSING] Authenticating user with Supabase');
    const supabase = createClient({ req, res });
    const { data } = await supabase.auth.getUser();
    
    if (!data || !data.user) {
      console.error('[FIX-MICRO-PROCESSING] Authentication failed: No user found');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = data.user;
    console.log(`[FIX-MICRO-PROCESSING] User authenticated: ${user.id}`);
    
    if (req.method === 'POST') {
      try {
        // Read the migration SQL file
        const migrationPath = path.join(process.cwd(), 'prisma', 'migration_recreate_micro_processing_settings.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Execute the migration
        console.log('[FIX-MICRO-PROCESSING] Executing migration SQL');
        await prisma.$executeRawUnsafe(migrationSQL);
        
        // Verify the table structure
        console.log('[FIX-MICRO-PROCESSING] Verifying table structure');
        const tableInfo = await prisma.$queryRaw`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'MicroProcessingSettings'
          ORDER BY ordinal_position;
        `;
        
        // Verify the constraints
        console.log('[FIX-MICRO-PROCESSING] Verifying constraints');
        const constraints = await prisma.$queryRaw`
          SELECT constraint_name, constraint_type
          FROM information_schema.table_constraints
          WHERE table_name = 'MicroProcessingSettings';
        `;
        
        return res.status(200).json({
          success: true,
          message: 'MicroProcessingSettings table recreated successfully',
          tableInfo,
          constraints
        });
      } catch (error) {
        console.error('[FIX-MICRO-PROCESSING] Error executing migration:', error);
        return res.status(500).json({
          error: 'Failed to execute migration',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[FIX-MICRO-PROCESSING] Unhandled error:', error);
    return res.status(500).json({
      error: 'An unexpected error occurred',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}