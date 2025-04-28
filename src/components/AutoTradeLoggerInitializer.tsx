import { useEffect } from 'react';
import { useErrorLog } from '@/contexts/ErrorLogContext';
import { autoTradeLogger } from '@/lib/autoTradeLogger';

/**
 * This component initializes the autoTradeLogger with the ErrorLogContext functions.
 * It should be included in the app's component tree to ensure errors are properly logged.
 */
export function AutoTradeLoggerInitializer() {
  const { captureLog, captureError, isEnabled } = useErrorLog();

  useEffect(() => {
    // Set the ErrorLogContext functions in the autoTradeLogger
    autoTradeLogger.setErrorLogFunctions(captureLog, captureError);
    
    // Log initialization
    if (isEnabled) {
      console.log('AutoTradeLogger initialized with ErrorLogContext');
    }
  }, [captureLog, captureError, isEnabled]);

  // This component doesn't render anything
  return null;
}

export default AutoTradeLoggerInitializer;