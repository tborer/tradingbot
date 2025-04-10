import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Handle GET request to fetch the USD balance
    if (req.method === 'GET') {
      const userData = await prisma.user.findUnique({
        where: { id: user.id },
        select: { usdBalance: true }
      });
      
      if (!userData) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      return res.status(200).json({ usdBalance: userData.usdBalance });
    }
    
    // Handle PUT request to update the USD balance
    if (req.method === 'PUT') {
      const { usdBalance } = req.body;
      
      if (usdBalance === undefined || isNaN(Number(usdBalance)) || Number(usdBalance) < 0) {
        return res.status(400).json({ error: 'Invalid USD balance value' });
      }
      
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { usdBalance: Number(usdBalance) },
        select: { usdBalance: true }
      });
      
      return res.status(200).json({ usdBalance: updatedUser.usdBalance });
    }
    
    // Handle unsupported methods
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}