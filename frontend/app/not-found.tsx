/**
 * Not Found Page
 * Displayed when a route doesn't exist
 */

import Link from 'next/link';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0B0F19] p-8">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <h1 className="text-8xl font-bold text-[#06B6D4]">404</h1>
        </div>

        <h2 className="text-2xl font-bold text-white mb-3">
          Page not found
        </h2>

        <p className="text-[#94A3B8] mb-8">
          The page you are looking for doesn't exist or has been moved.
        </p>

        <Link
          href="/"
          prefetch={false}
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#06B6D4] hover:bg-[#0891B2] text-white rounded-lg transition-colors"
        >
          <Home className="w-4 h-4" />
          Back to home
        </Link>
      </div>
    </div>
  );
}
