import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the user from the request
    const supabase = createClient(req);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = user.id;
    const { signalId, status, executedAt } = req.body;

    // Validate input
    if (!signalId) {
      return res.status(400).json({ error: 'Signal ID is required' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Check if the signal exists and belongs to the user
    const signal = await prisma.tradingSignal.findFirst({
      where: {
        id: signalId,
        userId
      }
    });

    if (!signal) {
      return res.status(404).json({ error: 'Signal not found' });
    }

    // Update the signal
    const updatedSignal = await prisma.tradingSignal.update({
      where: {
        id: signalId
      },
      data: {
        status,
        executedAt: executedAt ? new Date(executedAt) : undefined,
        updatedAt: new Date()
      }
    });

    return res.status(200).json(updatedSignal);
  } catch (error) {
    console.error('Error updating trading signal status:', error);
    return res.status(500).json({ error: 'Failed to update trading signal status', details: error.message });
  }
}