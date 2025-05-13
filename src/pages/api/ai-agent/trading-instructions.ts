import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get user from session
  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Handle GET request - retrieve trading instructions
  if (req.method === 'GET') {
    try {
      // Check if user has saved instructions
      const tradingInstructions = await prisma.tradingInstructions.findUnique({
        where: {
          userId: user.id
        }
      });

      if (!tradingInstructions) {
        return res.status(200).json({ instructions: null });
      }

      return res.status(200).json({ instructions: tradingInstructions.instructions });
    } catch (error) {
      console.error('Error retrieving trading instructions:', error);
      return res.status(500).json({ error: 'Failed to retrieve trading instructions' });
    }
  }

  // Handle POST request - save trading instructions
  if (req.method === 'POST') {
    try {
      const { instructions } = req.body;

      if (!instructions || typeof instructions !== 'string') {
        return res.status(400).json({ error: 'Invalid instructions' });
      }

      // Upsert trading instructions (create if not exists, update if exists)
      const savedInstructions = await prisma.tradingInstructions.upsert({
        where: {
          userId: user.id
        },
        update: {
          instructions,
          updatedAt: new Date()
        },
        create: {
          userId: user.id,
          instructions
        }
      });

      return res.status(200).json({ 
        success: true, 
        message: 'Trading instructions saved successfully',
        instructions: savedInstructions.instructions
      });
    } catch (error) {
      console.error('Error saving trading instructions:', error);
      return res.status(500).json({ error: 'Failed to save trading instructions' });
    }
  }

  // Handle unsupported methods
  return res.status(405).json({ error: 'Method not allowed' });
}