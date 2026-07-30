/**
 * Design System
 * Unified design tokens for consistent styling across the application
 */

// Color Palette - Light Theme
export const colors = {
  // Primary colors
  primary: {
    DEFAULT: '#4F46E5',    // Indigo 600 - Main actions, active states
    hover: '#4338CA',      // Indigo 700 - Hover states
    light: '#EEF2FF',      // Indigo 50 - Backgrounds, highlights
    dark: '#3730A3',       // Indigo 800 - Active states
  },

  // Background colors
  background: {
    primary: '#FFFFFF',     // Main backgrounds
    secondary: '#F9FAFB',   // Secondary backgrounds
    tertiary: '#F3F4F6',    // Tertiary backgrounds
    elevated: '#FFFFFF',    // Elevated surfaces
    input: '#FFFFFF',       // Input backgrounds
    hover: '#F3F4F6',       // Hover states
  },

  // Text colors
  text: {
    primary: '#111827',     // Headings, important text
    secondary: '#4B5563',   // Body text, descriptions
    tertiary: '#6B7280',     // Secondary content
    muted: '#9CA3AF',        // Labels, metadata
    placeholder: '#D1D5DB',  // Disabled, placeholders
    disabled: '#E5E7EB',    // Disabled state
  },

  // Border colors
  border: {
    DEFAULT: '#E5E7EB',     // Subtle borders
    medium: '#D1D5DB',      // Standard borders
    subtle: '#F3F4F6',      // Very subtle borders
    focus: '#4F46E5',       // Focus states
    error: '#FECACA',       // Error borders
  },

  // Status colors
  status: {
    success: '#059669',     // Emerald 600 - Success, complete
    successLight: '#D1FAE5', // Emerald 100 - Success backgrounds
    warning: '#D97706',     // Amber 600 - Warnings, important
    warningLight: '#FEF3C7', // Amber 100 - Warning backgrounds
    error: '#DC2626',       // Red 600 - Errors, critical
    errorLight: '#FEE2E2',   // Red 100 - Error backgrounds
    info: '#0284C7',        // Sky 600 - Information
    infoLight: '#E0F2FE',    // Sky 100 - Info backgrounds
  },

  // Semantic colors (categories)
  semantic: {
    blue: '#3B82F6',        // Blue 500 - Primary category
    emerald: '#10B981',     // Emerald 500 - Success category
    amber: '#F59E0B',       // Amber 500 - Warning category
    purple: '#8B5CF6',      // Purple 500 - Special category
    red: '#EF4444',         // Red 500 - Error category
  },
} as const;

// Typography
export const typography = {
  fontFamily: {
    sans: 'Inter, -apple-system, system-ui, sans-serif',
    mono: 'JetBrains Mono, Fira Code, monospace',
  },

  fontSize: {
    // Display - Hero sections
    displayXL: '1.875rem',        // 30px - Page titles
    displayLG: '1.5rem',          // 24px - Section headers

    // Body - Main content
    bodyLG: '1.125rem',           // 18px - Important body text
    bodyMD: '1rem',               // 16px - Standard body text
    bodySM: '0.875rem',           // 14px - Secondary body text

    // Utility - UI elements
    uiMD: '0.875rem',             // 14px - Buttons, labels
    uiSM: '0.75rem',              // 12px - Small labels, metadata
    uiXS: '0.6875rem',           // 11px - Tiny text, badges
  },

  fontWeight: {
    regular: '400',               // Body text
    medium: '500',                // Emphasized text, UI elements
    semibold: '600',              // Headings, important text
    bold: '700',                  // Strong emphasis
  },

  lineHeight: {
    tight: '1.25',                // Headings
    normal: '1.5',                // Body text
    relaxed: '1.75',              // Relaxed text
  },
} as const;

// Spacing (8px grid system)
export const spacing = {
  0: '0',
  1: '0.25rem',   // 4px - Tight spacing
  2: '0.5rem',    // 8px - Small gap
  3: '0.75rem',   // 12px - Medium gap
  4: '1rem',      // 16px - Standard gap
  5: '1.25rem',   // 20px - Large gap
  6: '1.5rem',    // 24px - Extra large gap
  8: '2rem',      // 32px - Section spacing
  10: '2.5rem',   // 40px - Major sections
  12: '3rem',     // 48px - Container spacing
} as const;

// Border Radius
export const borderRadius = {
  sm: '0.375rem',   // 6px - Small elements, badges
  md: '0.5rem',     // 8px - Standard elements, inputs
  lg: '0.75rem',    // 12px - Cards, containers
  xl: '1rem',       // 16px - Large cards, modals
  '2xl': '1.5rem',  // 24px - Extra large elements
  full: '9999px',   // Pills,完全圆形
} as const;

// Shadows
export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
} as const;

// Breakpoints (for reference, use Tailwind classes)
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// Transitions
export const transitions = {
  fast: '150ms ease-in-out',
  normal: '200ms ease-in-out',
  slow: '300ms ease-in-out',
} as const;

// Z-index scale
export const zIndex = {
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
} as const;

// Animation durations
export const animations = {
  fast: '150ms',
  normal: '200ms',
  slow: '300ms',
} as const;

// Component-specific tokens
export const components = {
  button: {
    padding: {
      sm: '0.5rem 1rem',
      md: '0.75rem 1.5rem',
      lg: '1rem 2rem',
    },
    fontSize: {
      sm: typography.fontSize.uiMD,
      md: typography.fontSize.bodyMD,
      lg: typography.fontSize.bodyLG,
    },
    borderRadius: borderRadius.md,
    minHeight: '2.75rem', // 44px minimum touch target
  },

  input: {
    padding: '0.75rem 1rem',
    fontSize: typography.fontSize.bodyMD,
    borderRadius: borderRadius.md,
    minHeight: '2.75rem',
  },

  card: {
    padding: '1.25rem',
    borderRadius: borderRadius.lg,
    gap: spacing[4],
  },

  modal: {
    padding: '1.5rem',
    borderRadius: borderRadius.xl,
    maxWidth: '32rem',
  },

  resultsContainer: {
    padding: spacing[8], // 32px
    borderRadius: borderRadius.xl,
  },

  metricCard: {
    padding: spacing[5], // 20px
    borderRadius: borderRadius.lg,
  },
} as const;

// CSS Custom Properties for runtime theming
export function getCSSVariables() {
  return {
    // Primary Colors
    '--color-primary': colors.primary.DEFAULT,
    '--color-primary-hover': colors.primary.hover,
    '--color-primary-light': colors.primary.light,
    '--color-primary-dark': colors.primary.dark,

    // Background Colors
    '--bg-primary': colors.background.primary,
    '--bg-secondary': colors.background.secondary,
    '--bg-tertiary': colors.background.tertiary,
    '--bg-elevated': colors.background.elevated,
    '--bg-hover': colors.background.hover,

    // Text Colors
    '--text-primary': colors.text.primary,
    '--text-secondary': colors.text.secondary,
    '--text-tertiary': colors.text.tertiary,
    '--text-muted': colors.text.muted,
    '--text-disabled': colors.text.disabled,

    // Border Colors
    '--border-color': colors.border.DEFAULT,
    '--border-medium': colors.border.medium,
    '--border-focus': colors.border.focus,

    // Status Colors
    '--color-success': colors.status.success,
    '--color-success-light': colors.status.successLight,
    '--color-warning': colors.status.warning,
    '--color-warning-light': colors.status.warningLight,
    '--color-error': colors.status.error,
    '--color-error-light': colors.status.errorLight,
    '--color-info': colors.status.info,
    '--color-info-light': colors.status.infoLight,

    // Semantic Colors
    '--color-blue': colors.semantic.blue,
    '--color-emerald': colors.semantic.emerald,
    '--color-amber': colors.semantic.amber,
    '--color-purple': colors.semantic.purple,
    '--color-red': colors.semantic.red,

    // Spacing
    '--spacing-1': spacing[1],
    '--spacing-2': spacing[2],
    '--spacing-3': spacing[3],
    '--spacing-4': spacing[4],
    '--spacing-5': spacing[5],
    '--spacing-6': spacing[6],
    '--spacing-8': spacing[8],

    // Border Radius
    '--radius-sm': borderRadius.sm,
    '--radius-md': borderRadius.md,
    '--radius-lg': borderRadius.lg,
    '--radius-xl': borderRadius.xl,

    // Transitions
    '--transition-fast': transitions.fast,
    '--transition-normal': transitions.normal,
    '--transition-slow': transitions.slow,

    // Typography
    '--font-sans': typography.fontFamily.sans,
    '--font-mono': typography.fontFamily.mono,
  } as const;
}
