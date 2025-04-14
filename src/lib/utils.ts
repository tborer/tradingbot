import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Get the absolute URL for API calls
export function getApiUrl(path: string): string {
  // In browser context, use relative URLs
  if (typeof window !== 'undefined') {
    return path;
  }
  
  // In server context, use absolute URLs
  // In production, use the VERCEL_URL environment variable
  // In development, use localhost
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : process.env.NODE_ENV === 'development' 
      ? 'http://localhost:3000' 
      : window?.location?.origin || '';
  
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}
