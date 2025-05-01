import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/util/supabase/api';
import { ensureReqCookies } from '@/util/api-helpers';

export interface AuthenticatedRequest extends NextApiRequest {
  user: {
    id: string;
    email?: string;
  };
}

/**
 * Middleware that handles authentication for API routes
 * 
 * This middleware:
 * 1. Ensures cookies are properly initialized
 * 2. Verifies the user is authenticated
 * 3. Adds the user to the request object
 * 4. Returns a 401 if authentication fails
 * 
 * @param handler The API route handler
 * @returns A handler function with authentication
 */
export function withAuth(
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Ensure cookies are properly initialized to prevent Supabase errors
      ensureReqCookies(req);

      // Create Supabase client with cookies
      const supabase = createClient(req, res);

      // Get user session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      // Handle session error
      if (sessionError) {
        console.error('[AUTH-MIDDLEWARE] Session error:', sessionError.message);
        return res.status(401).json({ error: 'Authentication failed', details: sessionError.message });
      }

      // Check if session exists and has a user
      if (!session || !session.user) {
        console.error('[AUTH-MIDDLEWARE] No session or user found');
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Add user to request object
      const authenticatedReq = req as AuthenticatedRequest;
      authenticatedReq.user = {
        id: session.user.id,
        email: session.user.email
      };

      // Call the handler with the authenticated request
      return handler(authenticatedReq, res);
    } catch (error) {
      console.error('[AUTH-MIDDLEWARE] Unexpected error:', error);
      return res.status(500).json({ error: 'Internal server error during authentication' });
    }
  };
}