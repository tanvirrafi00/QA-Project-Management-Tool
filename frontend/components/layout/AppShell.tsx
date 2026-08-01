
'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * 🧱 APP SHELL - Global layout wrapper
 *
 * Enforces:
 * - Fixed sidebar (264px)
 * - Proper flex constraints
 * - No overflow on main container
 * - Consistent header + content structure
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen bg-[#F9FAFB] overflow-hidden">
      {/* Fixed Sidebar - Never shrinks */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Fixed Header */}
        <div className="flex-shrink-0">
          <Header />
        </div>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}

interface PageContainerProps {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Standard page container with consistent max-width and padding
 */
export function PageContainer({ children, size = 'lg', className, style }: PageContainerProps) {
  const sizes = {
    sm: 'max-w-4xl',
    md: 'max-w-5xl',
    lg: 'max-w-7xl',
    full: 'max-w-full',
  };

  return (
    <div className={cn(
      // Max width
      sizes[size],
      // Center
      'mx-auto',
      // Strict left alignment grid - 24px horizontal padding
      'px-6 pt-10 pb-8',
      // Prevent overflow
      'min-h-0',
      className
    )} style={style}>
      {children}
    </div>
  );
}

interface GridProps {
  children: ReactNode;
  cols?: 1 | 2 | 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Responsive grid with consistent gap system
 */
export function Grid({ children, cols = 2, gap = 'lg', className }: GridProps) {
  const colClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4',
  };

  const gapClasses = {
    sm: 'gap-4',
    md: 'gap-6',
    lg: 'gap-8',
  };

  return (
    <div className={cn(
      'grid',
      colClasses[cols],
      gapClasses[gap],
      'min-h-0',
      className
    )}>
      {children}
    </div>
  );
}
