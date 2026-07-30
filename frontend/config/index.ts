/**
 * Application Configuration
 * Runtime configuration that can be environment-specific
 */

export const config = {
  app: {
    name: process.env.NEXT_PUBLIC_APP_NAME || 'Test Case Generator',
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    environment: process.env.NODE_ENV || 'development',
  },

  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001',
    timeout: parseInt(process.env.API_TIMEOUT || '180000', 10),
  },

  features: {
    bugGenerator: process.env.NEXT_PUBLIC_ENABLE_BUG_GENERATOR === 'true',
    apiTests: process.env.NEXT_PUBLIC_ENABLE_API_TESTS === 'true',
    gapAnalysis: process.env.NEXT_PUBLIC_ENABLE_GAP_ANALYSIS === 'true',
    exportToExcel: true,
  },

  ui: {
    theme: 'dark',
    defaultPageSize: 20,
    maxFileSize: 5 * 1024 * 1024, // 5MB
  },

  monitoring: {
    sentryDsn: process.env.SENTRY_DSN,
    enableAnalytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
  },
} as const;

export type AppConfig = typeof config;
