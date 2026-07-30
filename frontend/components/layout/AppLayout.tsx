'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * Legacy alias for AppShell
 * @deprecated Use AppShell directly instead
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-[#F9FAFB]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="p-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
