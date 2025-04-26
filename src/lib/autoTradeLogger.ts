// Simple logger for auto trade operations
class AutoTradeLogger {
  log(message: string) {
    try {
      console.log(`[AutoTrade] ${message}`);
    } catch (error) {
      console.error('Error in AutoTradeLogger.log:', error);
    }
  }
}

// Export a singleton instance
export const autoTradeLogger = new AutoTradeLogger();