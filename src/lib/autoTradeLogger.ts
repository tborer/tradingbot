// Enhanced logger for auto trade operations
class AutoTradeLogger {
  log(message: string, data?: any) {
    try {
      if (data) {
        console.log(`[AutoTrade] ${message}`, data);
      } else {
        console.log(`[AutoTrade] ${message}`);
      }
    } catch (error) {
      console.error('Error in AutoTradeLogger.log:', error);
    }
  }

  error(message: string, data?: any) {
    try {
      if (data) {
        console.error(`[AutoTrade ERROR] ${message}`, data);
      } else {
        console.error(`[AutoTrade ERROR] ${message}`);
      }
    } catch (error) {
      console.error('Error in AutoTradeLogger.error:', error);
    }
  }
}

// Export a singleton instance
export const autoTradeLogger = new AutoTradeLogger();