import type { AppProps } from 'next/app'
import { AuthProvider } from '@/contexts/AuthContext'
import { WebSocketLogProvider } from '@/contexts/WebSocketLogContext'
import { KrakenWebSocketProvider } from '@/contexts/KrakenWebSocketContext'
import { ResearchApiLogProvider } from '@/contexts/ResearchApiLogContext'
import '../styles/globals.css';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Toaster } from "@/components/ui/toaster"
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
      <AuthProvider>
        <WebSocketLogProvider>
          <ResearchApiLogProvider>
            <KrakenWebSocketProvider>
              <ProtectedRoute>
                <Component {...pageProps} />
              </ProtectedRoute>
              <Toaster />
            </KrakenWebSocketProvider>
          </ResearchApiLogProvider>
        </WebSocketLogProvider>
      </AuthProvider>
    </div>
  )
}