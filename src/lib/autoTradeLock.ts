import prisma from '@/lib/prisma';
import { logAutoTradeEvent, AutoTradeLogType } from './autoTradeLogger';

/**
 * Interface for the auto trade lock status
 */
interface AutoTradeLockStatus {
  isLocked: boolean;
  lockedAt?: Date;
  lockedBy?: string;
  cryptoId?: string;
  symbol?: string;
  action?: 'buy' | 'sell';
}

/**
 * Map to store in-memory locks for auto trades
 * This provides an additional layer of protection beyond the database locks
 * Key: cryptoId, Value: lock information
 */
const autoTradeLocks = new Map<string, AutoTradeLockStatus>();

/**
 * Acquires a lock for auto trading on a specific crypto
 * Returns true if the lock was acquired, false if it was already locked
 */
export async function acquireAutoTradeLock(
  userId: string,
  cryptoId: string,
  symbol: string,
  action: 'buy' | 'sell'
): Promise<boolean> {
  try {
    // First check the in-memory lock
    if (autoTradeLocks.has(cryptoId)) {
      const lockInfo = autoTradeLocks.get(cryptoId);
      
      // Log that we found an existing lock
      await logAutoTradeEvent(
        userId,
        AutoTradeLogType.INFO,
        `Auto trade already in progress for ${symbol}`,
        {
          cryptoId,
          symbol,
          action,
          existingLock: {
            lockedAt: lockInfo?.lockedAt,
            lockedBy: lockInfo?.lockedBy,
            action: lockInfo?.action
          }
        }
      );
      
      return false;
    }
    
    // Check if there's a database lock record
    const existingLock = await prisma.cryptoAutoTradeLock.findUnique({
      where: { cryptoId }
    });
    
    if (existingLock && !isLockExpired(existingLock.lockedAt)) {
      // Log that we found an existing lock in the database
      await logAutoTradeEvent(
        userId,
        AutoTradeLogType.INFO,
        `Auto trade already in progress for ${symbol} (database lock)`,
        {
          cryptoId,
          symbol,
          action,
          existingLock: {
            lockedAt: existingLock.lockedAt,
            lockedBy: existingLock.lockedBy,
            action: existingLock.action
          }
        }
      );
      
      return false;
    }
    
    // If there's an expired lock, we'll overwrite it
    const now = new Date();
    
    // Create or update the lock in the database
    await prisma.cryptoAutoTradeLock.upsert({
      where: { cryptoId },
      update: {
        lockedAt: now,
        lockedBy: userId,
        action
      },
      create: {
        cryptoId,
        lockedAt: now,
        lockedBy: userId,
        action,
        symbol
      }
    });
    
    // Also set the in-memory lock
    autoTradeLocks.set(cryptoId, {
      isLocked: true,
      lockedAt: now,
      lockedBy: userId,
      cryptoId,
      symbol,
      action
    });
    
    // Log that we acquired the lock
    await logAutoTradeEvent(
      userId,
      AutoTradeLogType.INFO,
      `Acquired auto trade lock for ${symbol} (${action})`,
      {
        cryptoId,
        symbol,
        action,
        lockedAt: now
      }
    );
    
    return true;
  } catch (error) {
    console.error(`Error acquiring auto trade lock for ${cryptoId}:`, error);
    
    // Log the error
    await logAutoTradeEvent(
      userId,
      AutoTradeLogType.ERROR,
      `Failed to acquire auto trade lock for ${symbol}: ${error.message}`,
      {
        cryptoId,
        symbol,
        action,
        error: error.message,
        stack: error.stack
      }
    );
    
    // In case of error, assume it's not safe to proceed
    return false;
  }
}

/**
 * Releases the auto trade lock for a specific crypto
 */
export async function releaseAutoTradeLock(
  userId: string,
  cryptoId: string,
  symbol: string
): Promise<void> {
  try {
    // Remove the in-memory lock
    autoTradeLocks.delete(cryptoId);
    
    // Remove the database lock
    await prisma.cryptoAutoTradeLock.delete({
      where: { cryptoId }
    }).catch(err => {
      // If the lock doesn't exist, that's fine
      if (err.code !== 'P2025') {
        throw err;
      }
    });
    
    // Log that we released the lock
    await logAutoTradeEvent(
      userId,
      AutoTradeLogType.INFO,
      `Released auto trade lock for ${symbol}`,
      {
        cryptoId,
        symbol,
        releasedAt: new Date()
      }
    );
  } catch (error) {
    console.error(`Error releasing auto trade lock for ${cryptoId}:`, error);
    
    // Log the error
    await logAutoTradeEvent(
      userId,
      AutoTradeLogType.ERROR,
      `Failed to release auto trade lock for ${symbol}: ${error.message}`,
      {
        cryptoId,
        symbol,
        error: error.message,
        stack: error.stack
      }
    );
  }
}

/**
 * Checks if a lock is expired (older than 5 minutes)
 * This prevents deadlocks if a process crashes without releasing the lock
 */
function isLockExpired(lockedAt: Date): boolean {
  const now = new Date();
  const lockAgeMs = now.getTime() - lockedAt.getTime();
  const LOCK_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  
  return lockAgeMs > LOCK_EXPIRY_MS;
}

/**
 * Clears all expired locks from the database
 * This should be called periodically to clean up stale locks
 */
export async function clearExpiredLocks(): Promise<number> {
  try {
    const now = new Date();
    const expiryThreshold = new Date(now.getTime() - (5 * 60 * 1000)); // 5 minutes ago
    
    // Find and delete all expired locks
    const { count } = await prisma.cryptoAutoTradeLock.deleteMany({
      where: {
        lockedAt: {
          lt: expiryThreshold
        }
      }
    });
    
    if (count > 0) {
      console.log(`Cleared ${count} expired auto trade locks`);
    }
    
    return count;
  } catch (error) {
    console.error('Error clearing expired auto trade locks:', error);
    return 0;
  }
}