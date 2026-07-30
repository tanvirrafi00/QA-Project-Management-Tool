/**
 * Application Constants
 * Centralized constants for type safety and maintainability
 */

// API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001',
  TIMEOUT: 180000,        // 3 minutes - AI multi-agent generation takes time
  RETRY_ATTEMPTS: 1,      // Reduced retries since each call takes ~2 minutes
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

// Cache durations in seconds
export const CACHE_DURATION = {
  SHORT: 60,          // 1 minute
  MEDIUM: 300,        // 5 minutes
  LONG: 3600,         // 1 hour
  DAY: 86400,         // 1 day
  WEEK: 604800,       // 1 week
} as const;

// Feature flags
export const FEATURE_FLAGS = {
  ENABLE_BUG_GENERATOR: process.env.NEXT_PUBLIC_ENABLE_BUG_GENERATOR === 'true',
  ENABLE_API_TESTS: process.env.NEXT_PUBLIC_ENABLE_API_TESTS === 'true',
  ENABLE_GAP_ANALYSIS: process.env.NEXT_PUBLIC_ENABLE_GAP_ANALYSIS === 'true',
} as const;

// Application metadata
export const APP_META = {
  TITLE: 'Test Case Generator',
  DESCRIPTION: 'AI-powered test case generation with multi-agent analysis',
  VERSION: '1.0.0',
} as const;

// Test case categories
export const TEST_CATEGORIES = {
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  EDGE: 'edge',
  SECURITY: 'security',
  BOUNDARY: 'boundary',
  SCENARIOS: 'scenarios',
} as const;

// Priority levels
export const PRIORITY_LEVELS = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

// UI Constants
export const UI_CONSTANTS = {
  TOAST_DURATION: 3000,
  DEBOUNCE_DELAY: 300,
  TOOLTIP_DELAY: 200,
} as const;

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  SERVER_ERROR: 'Server error. Please try again later.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
} as const;
