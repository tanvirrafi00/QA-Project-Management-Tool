/**
 * 🧱 LAYOUT PRIMITIVES
 * Core layout components that enforce the design system
 *
 * ❌ NEVER use custom margins/heights for layout
 * ✅ ONLY use these primitives
 */

'use client';

import React, { ReactNode, HTMLAttributes, Children } from 'react';
import { cn } from '@/lib/utils';
import { spacing, panel, colSpan, heights } from '@/lib/layout-system';

// ========== PAGE CONTAINER ==========
interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'full';
}

/**
 * PageContainer - Standard page wrapper with max-width and padding
 * Ensures consistent page layout across all modules
 */
export function PageContainer({ size = 'full', className, children, ...props }: PageContainerProps) {
  const sizes = {
    sm: 'max-w-4xl',
    md: 'max-w-5xl',
    lg: 'max-w-6xl',
    full: 'max-w-full',
  };

  return (
    <div
      className={cn(
        // Layout constraints
        'w-full mx-auto',
        // Size
        sizes[size],
        // Padding - matches AppShell (px-6 pt-10 pb-8) per ui-standards
        'px-6 pt-10 pb-8',
        // Prevent overflow
        'min-h-0',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ========== GRID LAYOUT ==========
interface GridLayoutProps extends HTMLAttributes<HTMLDivElement> {
  cols?: 1 | 2 | 3 | 4 | 6 | 12;
  gap?: keyof typeof spacing;
}

/**
 * GridLayout - 12-column grid system
 * Enforces consistent grid layout across all pages
 */
export function GridLayout({ cols = 12, gap = 'lg', className, children, ...props }: GridLayoutProps) {
  const colClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    6: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
    12: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-12',
  };

  return (
    <div
      className={cn(
        // Grid
        'grid',
        // Columns
        colClasses[cols],
        // Gap
        `gap-${gap === 'xs' ? 1 : gap === 'sm' ? 2 : gap === 'md' ? 3 : gap === 'lg' ? 4 : gap === 'xl' ? 6 : 8}`,
        // Prevent overflow
        'min-h-0',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ========== PANEL ==========
interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  padding?: keyof typeof panel.padding;
  scrollable?: boolean;
}

/**
 * Panel - Standard card/panel component
 * Used for ALL card-like containers
 * Ensures consistent padding and overflow behavior
 */
export function Panel({ padding = 'default', scrollable = false, className, children, ...props }: PanelProps) {
  const paddings = {
    compact: 'p-4',
    default: 'p-5',
    loose: 'p-6',
  };

  return (
    <div
      className={cn(
        // Base card styles
        'glass-panel rounded-xl',
        // Padding
        paddings[padding],
        // Overflow
        scrollable ? 'overflow-y-auto' : 'overflow-hidden',
        // Min height to prevent flex collapse
        'min-h-0',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ========== STACK ==========
interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: keyof typeof spacing;
  direction?: 'vertical' | 'horizontal';
}

/**
 * Stack - Vertical/horizontal spacing using ONLY gap system
 * ❌ NEVER use margin-bottom or margin-right
 * ✅ ALWAYS use Stack for spacing
 */
export function Stack({ gap = 'lg', direction = 'vertical', className, children, ...props }: StackProps) {
  const gapValue = gap === 'xs' ? 'gap-1' : gap === 'sm' ? 'gap-2' : gap === 'md' ? 'gap-3' : gap === 'lg' ? 'gap-4' : gap === 'xl' ? 'gap-6' : 'gap-8';

  return (
    <div
      className={cn(
        // Flex direction
        direction === 'vertical' ? 'flex flex-col' : 'flex',
        // Gap
        gapValue,
        // Prevent overflow
        'min-h-0',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ========== SPLIT PANE ==========
interface SplitPaneProps extends HTMLAttributes<HTMLDivElement> {
  left?: ReactNode;
  right?: ReactNode;
  leftWidth?: keyof typeof colSpan;
  rightWidth?: keyof typeof colSpan;
  gap?: keyof typeof spacing;
  stickyLeft?: boolean;
  stickyRight?: boolean;
}

/**
 * SplitPane - Standard 2-column layout for ALL modules
 * Left: Input panel (4-5 columns)
 * Right: Output panel (7-8 columns)
 *
 * Used by: Test Cases, Gap Analysis, API Tests, Bug Generator
 */
export function SplitPane({
  left,
  right,
  gap = 'xl',
  stickyLeft = false,
  stickyRight = false,
  className,
  children,
  ...props
}: SplitPaneProps & { children?: ReactNode }) {
  const gapValue = gap === 'xs' ? 'gap-1' : gap === 'sm' ? 'gap-2' : gap === 'md' ? 'gap-3' : gap === 'lg' ? 'gap-4' : gap === 'xl' ? 'gap-6' : 'gap-8';

  const childrenArray = Children.toArray(children);
  const leftPane = left || childrenArray[0];
  const rightPane = right || childrenArray[1];

  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-12', gapValue, 'min-h-0 items-start', className)} {...props}>
      {/* Left Panel */}
      <div className={cn('lg:col-span-4 min-h-0', stickyLeft && 'lg:sticky lg:top-8')}>
        {leftPane}
      </div>

      {/* Right Panel */}
      <div className={cn('lg:col-span-8 min-h-0', stickyRight && 'lg:sticky lg:top-8')}>
        {rightPane}
      </div>
    </div>
  );
}

// ========== SCROLL AREA ==========
interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  maxHeight?: keyof typeof heights.card;
}

/**
 * ScrollArea - Explicit scrollable container
 * Prevents overflow issues
 */
export function ScrollArea({ maxHeight = 'lg', className, children, ...props }: ScrollAreaProps) {
  const heightClasses = {
    sm: 'max-h-[200px]',
    md: 'max-h-[400px]',
    lg: 'max-h-[600px]',
  };

  return (
    <div
      className={cn(
        'overflow-y-auto min-h-0',
        heightClasses[maxHeight],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ========== INPUT GROUP ==========
interface InputGroupProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  required?: boolean;
  error?: string;
}

/**
 * InputGroup - Consistent input wrapper
 * Ensures label + input + error spacing
 */
export function InputGroup({ label, required = false, error, className, children, ...props }: InputGroupProps) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      {label && (
        <label className="text-sm font-medium text-[#0F172A]">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="text-sm text-red-400 flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-red-400" />
          {error}
        </p>
      )}
    </div>
  );
}

// Export all primitives
export const LayoutPrimitives = {
  PageContainer,
  GridLayout,
  Panel,
  Stack,
  SplitPane,
  ScrollArea,
  InputGroup,
};
