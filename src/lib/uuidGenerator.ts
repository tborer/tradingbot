import { randomUUID } from 'crypto';

/**
 * Generates a UUID v4 string
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * Generates a process ID with a prefix and UUID
 */
export function generateProcessId(prefix: string = 'process'): string {
  return `${prefix}-${generateUUID()}`;
}

/**
 * Generates a cron-specific process ID
 */
export function generateCronProcessId(userId: string = 'system'): string {
  return `cron-${userId}-${generateUUID()}`;
}

/**
 * Validates if a string is a valid UUID format
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}