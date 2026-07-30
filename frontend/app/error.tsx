/**
 * Global Error Boundary for the application
 * Catches errors in Server Components and Server Actions
 */

'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0B0F19] p-8">
      <div className="max-w-md w-full text-center">
        <div className="mb-6 flex justify-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white mb-3">
          Something went wrong
        </h2>

        <p className="text-[#94A3B8] mb-8">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>

        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#06B6D4] hover:bg-[#0891B2] text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>

          <button
            onClick={() => window.location.href = '/'}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#21262D] hover:bg-[#30363D] text-white rounded-lg transition-colors"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}
