import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow PUT method
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the authenticated user
    const supabase = createClient(req, res);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get the crypto ID and new shares value from the request body
    const { id, shares } = req.body;

    if (!id || shares === undefined || isNaN(Number(shares)) || Number(shares) < 0) {
      return res.status(400).json({ error: 'Invalid request. Crypto ID and valid shares value are required.' });
    }

    // Update the crypto shares in the database
    const updatedCrypto = await prisma.crypto.update({
      where: {
        id: id,
        userId: user.id, // Ensure the crypto belongs to the authenticated user
      },
      data: {
        shares: Number(shares),
      },
    });

    return res.status(200).json(updatedCrypto);
  } catch (error) {
    console.error('Error updating crypto shares:', error);
    return res.status(500).json({ error: 'Failed to update crypto shares' });
  }
}