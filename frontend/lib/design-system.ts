/**
 * 🎨 UNIFIED DESIGN SYSTEM
 * Single source of truth for ALL design tokens
 *
 * Imports spacing/layout from layout-system.ts
 * Defines typography and color systems
 * Exports component style variants
 *
 * ❌ NEVER use hardcoded values
 * ✅ ONLY use tokens from this system
 */

import { spacing } from './layout-system';

// ========== TYPOGRAPHY SYSTEM ==========
export const typography = {
  font: {
    sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif',
    mono: '"JetBrains Mono", "Fira Code", monospace',
  },
  size: {
    page: '28px',      // Page titles (h1)
    section: '20px',   // Section headers (h2, h3)
    body: '14px',      // Body text (p, span)
    muted: '13px',     // Helper text
    tiny: '12px',      // Labels, tiny text
  },
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
  weight: {
    normal: '400',
    medium: '500',
    semibold: '600',
  },
} as const;

// ========== COLOR SYSTEM ==========
export const colors = {
  // Backgrounds
  background: {
    primary: '#0F172A',
    card: '#111827',
    elevated: '#1E293B',
    input: '#0F172A',
    hover: '#1E293B',
  },

  // Text
  text: {
    primary: '#F8FAFC',
    secondary: '#CBD5E1',
    muted: '#94A3B8',
    placeholder: '#64748B',
  },

  // Brand colors
  primary: '#3B82F6',
  primaryHover: '#2563EB',
  primaryLight: 'rgba(59, 130, 246, 0.1)',

  // Status colors
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Borders
  border: {
    subtle: 'rgba(51, 65, 85, 0.5)',
    default: '#334155',
    focus: '#3B82F6',
  },
} as const;

// ========== BORDER RADIUS ==========
export const borderRadius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  full: '9999px',
} as const;

// ========== SHADOWS ==========
export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 4px 6px rgba(0, 0, 0, 0.3)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.3)',
  xl: '0 20px 25px rgba(0, 0, 0, 0.3)',
  glow: '0 0 20px rgba(59, 130, 246, 0.3)',
} as const;

// ========== TRANSITIONS ==========
export const transitions = {
  fast: '150ms ease-in-out',
  normal: '200ms ease-in-out',
  slow: '300ms ease-in-out',
} as const;

// ========== COMPONENT STYLE VARIANTS ==========

// Button sizes
export const buttonSizes = {
  sm: {
    height: '36px',
    padding: '0 12px',
    fontSize: typography.size.body,
    iconSize: '16px',
  },
  md: {
    height: '44px',
    padding: '0 16px',
    fontSize: typography.size.body,
    iconSize: '18px',
  },
  lg: {
    height: '48px',
    padding: '0 20px',
    fontSize: typography.size.body,
    iconSize: '20px',
  },
} as const;

// Input sizes
export const inputSizes = {
  sm: {
    height: '36px',
    padding: '0 12px',
    fontSize: typography.size.body,
  },
  md: {
    height: '44px',
    padding: '0 12px',
    fontSize: typography.size.body,
  },
  lg: {
    height: '48px',
    padding: '0 16px',
    fontSize: typography.size.body,
  },
} as const;

// Card padding
export const cardPadding = {
  compact: spacing.lg,     // 16px
  default: spacing.xl,    // 24px
  loose: spacing['2xl'],  // 32px
} as const;

// Icon sizes
export const iconSizes = {
  xs: '14px',
  sm: '16px',
  md: '18px',
  lg: '20px',
  xl: '24px',
} as const;

// Export spacing from layout system for convenience
export { spacing } from './layout-system';

// Type exports
export type SpacingToken = keyof typeof spacing;
