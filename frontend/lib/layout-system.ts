/**
 * 🧱 STRICT LAYOUT SYSTEM
 * Single source of truth for ALL spacing and layout values
 *
 * ❌ NEVER use random spacing values
 * ✅ ONLY use tokens from this system
 */

// ========== SPACING TOKENS (STRICT) ==========
export const spacing = {
  xs: '4px',    // gap-1
  sm: '8px',    // gap-2
  md: '12px',   // gap-3
  lg: '16px',   // gap-4
  xl: '24px',   // gap-6
  '2xl': '32px', // gap-8
  '3xl': '48px', // gap-12
} as const;

export type SpacingToken = keyof typeof spacing;

// ========== GRID SYSTEM ==========
export const grid = {
  columns: {
    mobile: 1,
    tablet: 6,
    desktop: 12,
  },
  gap: {
    default: spacing.lg,
    compact: spacing.md,
    loose: spacing.xl,
  },
} as const;

// ========== LAYOUT CONSTRAINTS ==========
export const constraints = {
  // Prevent overflow
  minHeight: '0',
  maxHeight: 'none',

  // Flex behavior
  flexShrink: {
    never: '0',
    allow: '1',
  },

  // Overflow
  overflow: {
    hidden: 'hidden',
    auto: 'auto',
    visible: 'visible',
  },

  // Width constraints
  maxWidth: {
    xs: '320px',
    sm: '480px',
    md: '640px',
    lg: '768px',
    xl: '1024px',
    '2xl': '1280px',
    full: '100%',
  },
} as const;

// ========== CONTAINER SIZES ==========
export const containers = {
  page: '1400px',
  panel: '100%',
  input: '100%',
  output: '100%',
} as const;

// ========== PANEL CONFIGURATION ==========
export const panel = {
  padding: {
    compact: '16px',  // spacing.lg
    default: '20px', // spacing.xl
    loose: '24px',   // spacing['2xl']
  },
  borderRadius: '12px',
  gap: spacing.lg,
} as const;

// ========== GRID COLUMN SPANS ==========
export const colSpan = {
  full: 'span-12',
  half: 'span-6',
  third: 'span-4',
  quarter: 'span-3',
  left: 'col-span-4',
  right: 'col-span-8',
  auto: 'col-auto',
} as const;

// ========== HEIGHT CONSTRAINTS ==========
export const heights = {
  input: {
    sm: '40px',
    md: '44px',
    lg: '48px',
  },
  card: {
    sm: '200px',
    md: '400px',
    lg: '600px',
  },
  viewport: {
    minusHeader: 'calc(100vh - 64px)',
    minusNav: 'calc(100vh - 180px)',
  },
} as const;

// ========== RESPONSIVE BREAKPOINTS ==========
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ========== UTILITY FUNCTIONS ==========
/**
 * Get spacing value by token
 */
export function getSpace(token: SpacingToken): string {
  return spacing[token];
}

/**
 * Generate grid class based on column span
 */
export function getGridClass(span: number): string {
  return `col-span-${span}`;
}

/**
 * Generate responsive grid class
 */
export function getResponsiveGrid(
  mobile: number = 1,
  tablet?: number,
  desktop?: number
): string {
  const classes = [`grid-cols-${mobile}`];
  if (tablet) classes.push(`md:grid-cols-${tablet}`);
  if (desktop) classes.push(`lg:grid-cols-${desktop}`);
  return classes.join(' ');
}
