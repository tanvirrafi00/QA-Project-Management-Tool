// MUST be first: loads .env during import resolution, before the repositories import `client.ts`
// (which reads DATABASE_URL at module-eval time). A late `dotenv.config()` here would race and leave
// DATABASE_URL undefined → the pool falls back to the libpq default (db = OS user).
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import testGenerationRoutes from './modules/test-generation/routes/test-generation.routes';
import generationJobRoutes from './modules/test-generation/routes/generation-job.routes';
import bugManagementRoutes from './modules/bug-management/routes/bug-management.routes';
import testCaseManagementRoutes from './modules/test-case-management/routes/test-case.routes';
import projectManagementRoutes from './modules/project-management/routes/project.routes';
import estimationRoutes from './modules/project-estimation/routes/estimation.routes';
import authRoutes from './modules/identity/routes/auth.routes';
import userRoutes from './modules/identity/routes/user.routes';
import aiProviderManager from './ai/providers/provider.manager';
import { ensureBootstrapAdmin } from './modules/identity/seed';
import logger from './shared/logger';
import { authenticate } from './middleware/auth';
import { validateJwtConfig } from './shared/auth';
import { errorResponse } from './shared/errors';
import { sendError } from './shared/http/responses';
import { isDatabaseConfigured, validateConnection, databaseConfig, closeDb } from './shared/db';
import { validateDatabaseOnStartup } from './shared/db/startup-health';
import { mapDatabaseError } from './shared/db/errors';

const app = express();
// Default 5001 to match the frontend (.env.local → NEXT_PUBLIC_API_URL=http://localhost:5001).
const PORT = process.env.PORT || 5001;

// Fail fast on insecure JWT configuration (missing/dev/default or shared access+refresh secrets).
// Throws in production; warns otherwise. Must run after `dotenv/config` (imported first above).
validateJwtConfig();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware (structured — routed through the shared logger)
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Auth flag — when true, the existing resource routers require a valid access token. Off by default
// (Migration Roadmap Step 2); per-route `authorize(...)` gates and the final flip-on happen in Step 6.
const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';
const authGate = AUTH_ENABLED ? [authenticate] : [];

// API Routes — existing modules (gated only when AUTH_ENABLED=true)
app.use('/api/generate', ...authGate, testGenerationRoutes);
app.use('/api/generation-jobs', ...authGate, generationJobRoutes);
app.use('/api/bugs', ...authGate, bugManagementRoutes);
app.use('/api/test-cases', ...authGate, testCaseManagementRoutes);
app.use('/api/projects', ...authGate, projectManagementRoutes);
app.use('/api/estimations', ...authGate, estimationRoutes);

// Identity module — always mounted. /api/auth/login + /refresh are public; everything else requires
// a valid access token. Identity is SQL-backed, so login/seed require DATABASE_URL to be set.
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Health check with database connectivity status
app.get('/api/health', async (req, res) => {
  const healthStatus = {
    status: 'ok',
    service: 'AI QA Copilot Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: {
      configured: isDatabaseConfigured(),
      connected: false,
      type: isDatabaseConfigured() ? 'postgresql' : 'in-memory',
      error: undefined as string | undefined,
    }
  };

  // Test database connection if configured
  if (isDatabaseConfigured()) {
    try {
      await validateConnection();
      healthStatus.database.connected = true;
    } catch (error) {
      healthStatus.database.connected = false;
      healthStatus.database.error = error instanceof Error ? error.message : String(error);
    }
  }

  // Set appropriate HTTP status based on database connectivity
  const httpStatus = isDatabaseConfigured() && !healthStatus.database.connected ? 503 : 200;

  res.status(httpStatus).json(healthStatus);
});

// Root endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'AI QA Copilot API',
    version: '2.0.0',
    endpoints: {
      health: 'GET /api/health',
      generateTestCases: 'POST /api/generate/test-cases',
      generateBug: 'POST /api/bugs/generate',
      saveBug: 'POST /api/bugs/save',
      listBugs: 'GET /api/bugs',
      bugAnalytics: 'GET /api/bugs/analytics',
      saveTestCase: 'POST /api/test-cases/save',
      bulkSaveTestCases: 'POST /api/test-cases/bulk-save',
      listTestCases: 'GET /api/test-cases',
      testCaseAnalytics: 'GET /api/test-cases/analytics',
      testCaseModules: 'GET /api/test-cases/modules',
      projects: 'GET /api/projects',
      createProject: 'POST /api/projects',
      projectSummary: 'GET /api/projects/summary',
      activeProjects: 'GET /api/projects/active',
      authLogin: 'POST /api/auth/login',
      authRefresh: 'POST /api/auth/refresh',
      authLogout: 'POST /api/auth/logout',
      authMe: 'GET /api/auth/me',
      users: 'GET /api/users (admin)',
    },
  });
});

// 404 catch-all — unmatched routes return the standard JSON error envelope (not Express's default
// HTML/text 404), keeping the response contract consistent for every path. Must be mounted after all
// routes and before the error handler.
app.use((req: express.Request, res: express.Response) => {
  sendError(res, 404, `Route not found: ${req.method} ${req.path}`);
});

// Error handling middleware — maps typed AppError subclasses to status codes via `errorResponse`,
// returning the standard `{ success: false, message, errors? }` envelope. Unknown errors never leak details.
// Database errors (PostgreSQL SQLSTATE) are first funneled through `mapDatabaseError` so that
// constraint violations (unique → 409, FK/not-null/check → 400) and connection issues (→ 503)
// reach the client with the correct status + a descriptive message, even when a controller's own
// try/catch didn't anticipate them. (Requirement 14 · Task 5.1)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Log full detail server-side (stack included) for diagnostics; the client only ever receives
  // the sanitized `errorResponse` body below — never the raw error or stack.
  logger.error('Unhandled error during request', {
    method: req.method,
    path: req.path,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  const { status, body } = errorResponse(mapDatabaseError(err));
  res.status(status).json(body);
});

// Start server
app.listen(PORT, async () => {
  // Validate database configuration on startup
  await validateDatabaseOnStartup();

  // Clean foundation: no business data is seeded. Only ensure a bootstrap admin exists.
  await ensureBootstrapAdmin();

  const providers = aiProviderManager.getAvailableProviders();
  const isConfigured = aiProviderManager.isConfigured();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 AI QA Copilot Backend v2.0.0 running on port ${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
  console.log(`🗄️  Database: ${isDatabaseConfigured() ? `PostgreSQL (${databaseConfig.host}:${databaseConfig.port}/${databaseConfig.database})` : 'In-memory fallback'}`);
  console.log(`🤖 AI Providers: ${providers.join(', ') || 'none configured'}`);
  console.log(`✅ AI Configured: ${isConfigured ? 'Yes' : 'No (set GLM_API_KEY / GEMINI_API_KEY to enable generation)'}`);
  console.log(`${'='.repeat(60)}\n`);

  logger.info('Server started', {
    port: PORT,
    providers,
    configured: isConfigured,
    databaseConfigured: isDatabaseConfigured(),
    environment: databaseConfig?.environment || 'unknown'
  });
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await closeDb();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await closeDb();
  process.exit(0);
});

export default app;
