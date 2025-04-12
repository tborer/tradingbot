import React from 'react';
import { ErrorBoundary } from '@/contexts/ErrorLogContext';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
}

const ErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({
  error,
  resetErrorBoundary,
}) => {
  return (
    <Alert variant="destructive" className="m-4">
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>
        <div className="mt-2">
          <p className="text-sm">{error.message}</p>
          <div className="mt-4">
            <Button onClick={resetErrorBoundary}>Try again</Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
};

const GlobalErrorBoundary: React.FC<GlobalErrorBoundaryProps> = ({ children }) => {
  return (
    <ErrorBoundary
      fallback={({ error, resetErrorBoundary }: any) => (
        <ErrorFallback error={error} resetErrorBoundary={resetErrorBoundary} />
      )}
    >
      {children}
    </ErrorBoundary>
  );
};

export default GlobalErrorBoundary;