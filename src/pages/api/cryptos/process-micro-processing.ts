import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { processMicroProcessing } from '@/lib/microProcessingService';
import { autoTradeLogger } from '@/lib/autoTradeLogger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the user from Supabase auth
  const supabase = createClient({ req, res });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Log the start of processing
    autoTradeLogger.log(`Starting micro processing for user ${user.id}`);
    
    // Process micro processing for the user
    await processMicroProcessing(user.id);
    
    // Return success
    return res.status(200).json({ success: true, message: 'Micro processing completed successfully' });
  } catch (error) {
    console.error('Error processing micro trades:', error);
    autoTradeLogger.log(`Error in process-micro-processing API: ${error.message}`);
    return res.status(500).json({ error: 'Failed to process micro trades', details: error.message });
  }
}