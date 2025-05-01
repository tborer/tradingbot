# API Cookie Initialization Solution

## Problem

The application was experiencing authentication errors in API routes with the following error:

```
TypeError: Cannot convert undefined or null to object
    at Function.keys (<anonymous>)
    at Object.getAll (/var/task/.next/server/chunks/105.js:681:31)
    at getAll (/var/task/node_modules/.pnpm/@supabase+ssr@0.5.2_@supabase+supabase-js@2.46.1/node_modules/@supabase/ssr/dist/main/cookies.js:72:48)
```

This error occurs when the Supabase authentication code tries to access `req.cookies` which is sometimes `undefined` or `null`.

## Solution

We've implemented a two-part solution:

1. A utility function `ensureReqCookies` in `src/util/api-helpers.ts` that initializes `req.cookies` if it doesn't exist
2. A middleware wrapper `withCookies` in `src/util/api-middleware.ts` that applies this function to API route handlers

## How to Use

### Option 1: Direct initialization at the beginning of an API route

```typescript
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Initialize req.cookies at the very beginning to prevent authentication errors
  if (!req.cookies) {
    req.cookies = {};
    console.log('[API] req.cookies was undefined, initialized to empty object');
  }
  
  // Rest of your API handler code...
}
```

### Option 2: Using the withCookies middleware (recommended)

```typescript
import { withCookies } from '@/util/api-middleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Your API handler code...
}

// Export the handler wrapped with the withCookies middleware
export default withCookies(handler, 'YOUR-API-NAME');
```

## Files Modified

We've already applied the fix to the following API routes:

1. `src/pages/api/cryptos/micro-processing-settings.ts` - Direct initialization
2. `src/pages/api/cryptos/process-micro-processing.ts` - Direct initialization
3. `src/pages/api/cryptos/binance-test.ts` - Direct initialization
4. `src/pages/api/cryptos/auto-trade-settings.ts` - Using withCookies middleware

## Recommendation

For all new API routes, use the `withCookies` middleware approach as it's cleaner and ensures consistent handling across all routes.

For existing routes experiencing authentication issues, you can choose either approach based on what's easier to implement without disrupting existing code.