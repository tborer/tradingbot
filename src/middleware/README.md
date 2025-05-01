# Authentication Middleware for API Routes

This directory contains middleware for simplifying authentication in API routes.

## Overview

The authentication middleware provides a consistent way to handle user authentication across all API routes. It:

1. Ensures cookies are properly initialized to prevent Supabase errors
2. Verifies the user is authenticated
3. Adds the user to the request object
4. Returns a 401 if authentication fails

## Usage

### 1. Import the middleware in your API route

```typescript
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
```

### 2. Create your handler function with the AuthenticatedRequest type

```typescript
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Your API logic here
  // Access the authenticated user with req.user
  const userId = req.user.id;
  
  // Rest of your API handler...
}
```

### 3. Export the handler wrapped with the withAuth middleware

```typescript
export default withAuth(handler);
```

## Benefits

- **Simplified Authentication**: No need to manually check for authentication in each API route
- **Consistent Error Handling**: All authentication errors are handled consistently
- **Type Safety**: The `AuthenticatedRequest` type ensures you have access to the user object
- **Prevents Cookie Errors**: Automatically initializes cookies to prevent the "Cannot convert undefined or null to object" errors

## Example

```typescript
import { NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    // User is already authenticated by the middleware
    const userId = req.user.id;
    
    // Get user data from database
    const userData = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    return res.status(200).json(userData);
  } catch (error) {
    return res.status(500).json({ error: 'An error occurred' });
  }
}

export default withAuth(handler);
```

## Client-Side Usage

On the client side, you can simplify API calls by using a `fetchWithAuth` helper function that handles authentication errors:

```typescript
const fetchWithAuth = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    // Handle 401 Unauthorized
    if (response.status === 401) {
      router.push('/login');
      throw new Error('Authentication failed');
    }
    
    // Handle other errors
    const errorData = await response.json();
    throw new Error(errorData.error || 'Request failed');
  }
  
  return response;
};
```

## Implementation Details

The middleware uses the Supabase client to verify the user's session and extract the user information. It ensures that cookies are properly initialized to prevent the common "Cannot convert undefined or null to object" errors that occur when the cookies object is undefined.

If authentication fails, the middleware returns a 401 Unauthorized response, preventing the handler from being called.