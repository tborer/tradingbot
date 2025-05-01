import { NextApiRequest } from 'next';

/**
 * Ensures that req.cookies exists to prevent "Cannot convert undefined or null to object" errors
 * when using Supabase authentication in API routes.
 * 
 * @param req The Next.js API request object
 * @param logPrefix Optional prefix for log messages
 * @returns The request object with initialized cookies if needed
 */
export function ensureReqCookies(req: NextApiRequest, logPrefix: string = 'API'): NextApiRequest {
  if (!req.cookies) {
    req.cookies = {};
    console.log(`[${logPrefix}] req.cookies was undefined, initialized to empty object`);
  }
  return req;
}