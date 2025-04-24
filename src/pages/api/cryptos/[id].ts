import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Initialize Supabase client
    const supabase = createClient(req, res);
    
    // Get the user session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session || !session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = session.user;
    
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid crypto ID' });
    }
    
    // Check if the crypto exists and belongs to the user
    const crypto = await prisma.crypto.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });
    
    if (!crypto) {
      return res.status(404).json({ error: 'Crypto not found' });
    }
    
    // GET - Retrieve crypto
    if (req.method === 'GET') {
      return res.status(200).json(crypto);
    }
    
    // PUT - Update crypto
    if (req.method === 'PUT') {
      const { symbol, purchasePrice, autoSell, autoBuy } = req.body;
      
      const updateData: any = {};
      
      if (symbol !== undefined) updateData.symbol = symbol.toUpperCase();
      if (purchasePrice !== undefined) updateData.purchasePrice = parseFloat(purchasePrice);
      if (autoSell !== undefined) updateData.autoSell = autoSell;
      if (autoBuy !== undefined) updateData.autoBuy = autoBuy;
      
      const updatedCrypto = await prisma.crypto.update({
        where: { id },
        data: updateData,
      });
      
      return res.status(200).json(updatedCrypto);
    }
    
    // DELETE - Remove crypto
    if (req.method === 'DELETE') {
      await prisma.crypto.delete({
        where: { id },
      });
      
      return res.status(200).json({ message: 'Crypto deleted successfully' });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}