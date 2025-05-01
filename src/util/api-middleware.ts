import { NextApiRequest, NextApiResponse } from 'next';
import { ensureReqCookies } from './api-helpers';

type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void;

/**
 * Middleware that ensures req.cookies exists before the handler is called.
 * This prevents "Cannot convert undefined or null to object" errors when using
 * Supabase authentication in API routes.
 * 
 * @param handler The API route handler function
 * @param logPrefix Optional prefix for log messages
 * @returns A wrapped handler function with cookie initialization
 */
export function withCookies(handler: ApiHandler, logPrefix: string = 'API'): ApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Initialize req.cookies if it doesn't exist
    ensureReqCookies(req, logPrefix);
    
    // Call the original handler
    return handler(req, res);
  };
}