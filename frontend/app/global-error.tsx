/**
 * Global Error Boundary
 * Catches errors that are not caught by other error boundaries
 * This is the last resort error handler
 */

'use client';

import { AlertTriangle } from 'lucide-react';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0B0F19] p-8">
          <div className="max-w-md w-full text-center">
            <div className="mb-6 flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white mb-3">
              Critical Error
            </h2>

            <p className="text-[#94A3B8] mb-8">
              A critical error has occurred. Please refresh the page.
            </p>

            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#06B6D4] hover:bg-[#0891B2] text-white rounded-lg transition-colors"
            >
              Refresh page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
