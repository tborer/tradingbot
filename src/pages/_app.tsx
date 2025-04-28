import type { AppProps } from 'next/app'
import { AuthProvider } from '@/contexts/AuthContext'
import { WebSocketLogProvider } from '@/contexts/WebSocketLogContext'
import { KrakenWebSocketProvider } from '@/contexts/KrakenWebSocketContext'
import { BinanceWebSocketProvider } from '@/contexts/BinanceWebSocketContext'
import { ResearchApiLogProvider } from '@/contexts/ResearchApiLogContext'
import { BalanceApiLogProvider } from '@/contexts/BalanceApiLogContext'
import { AnalysisProvider } from '@/contexts/AnalysisContext'
import { ErrorLogProvider } from '@/contexts/ErrorLogContext'
import '../styles/globals.css';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Toaster } from "@/components/ui/toaster"
import GlobalErrorBoundary from '@/components/GlobalErrorBoundary';
import AutoTradeLoggerInitializer from '@/components/AutoTradeLoggerInitializer';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function App({ Component, pageProps }: AppProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    const colorScheme = computedStyle.getPropertyValue('--mode').trim().replace(/"/g, '');
    if (colorScheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.add('light');
    }
    setMounted(true);
  }, []);

  // Prevent flash while theme loads
  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <ErrorLogProvider>
        <GlobalErrorBoundary>
          <AuthProvider>
            <WebSocketLogProvider>
              <ResearchApiLogProvider>
                <BalanceApiLogProvider>
                  <KrakenWebSocketProvider>
                    <BinanceWebSocketProvider>
                      <AnalysisProvider>
                        {/* Initialize AutoTradeLogger with ErrorLogContext */}
                        <AutoTradeLoggerInitializer />
                        <ProtectedRoute>
                          <Component {...pageProps} />
                        </ProtectedRoute>
                        <Toaster />
                      </AnalysisProvider>
                    </BinanceWebSocketProvider>
                  </KrakenWebSocketProvider>
                </BalanceApiLogProvider>
              </ResearchApiLogProvider>
            </WebSocketLogProvider>
          </AuthProvider>
        </GlobalErrorBoundary>
      </ErrorLogProvider>
    </div>
  )
}