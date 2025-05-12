import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { generateAIAgentData } from '@/lib/aiAgentUtils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Generate AI Agent data
    const aiAgentData = await generateAIAgentData(user.id);
    
    return res.status(200).json(aiAgentData);
  } catch (error) {
    console.error('Error generating AI Agent data:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}