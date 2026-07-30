/**
 * Database startup health validation — extracted from the app entrypoint (src/index.ts) for
 * readability. Runs comprehensive connectivity / pool / SSL checks with retry on boot, and
 * falls back to in-memory repositories (non-production) when the database is unreachable.
 *
 * Validates: Requirements 1.3, 1.4, 1.6
 */

import logger from '../logger';
import { databaseConfig, isDatabaseConfigured } from './config';
import { validateConnection, withRetry } from './client';

// Database startup validation with comprehensive health checks and retry logic
// Validates: Requirements 1.3, 1.4, 1.6
export async function validateDatabaseOnStartup(): Promise<void> {
  if (isDatabaseConfigured()) {
    logger.info('Starting comprehensive database connection health validation on startup', {
      host: databaseConfig.host,
      database: databaseConfig.database,
      environment: databaseConfig.environment,
      poolConfig: {
        min: databaseConfig.pool.min,
        max: databaseConfig.pool.max,
        connectionTimeoutMs: databaseConfig.pool.connectionTimeoutMillis,
        acquireTimeoutMs: databaseConfig.pool.acquireTimeoutMillis,
      },
      sslMode: databaseConfig.ssl.mode,
      retryConfig: {
        maxAttempts: databaseConfig.health.retryAttempts,
        retryDelay: databaseConfig.health.retryDelay,
        backoffStrategy: databaseConfig.health.retryBackoff,
      },
    });

    try {
      // Phase 1: Basic connection health validation with retry logic
      logger.info('Phase 1: Validating basic database connectivity with exponential backoff retry');

      await withRetry(async () => {
        await validateConnection();
        logger.debug('Basic connection health check passed');
      }, 'startup connection health validation');

      logger.info('Phase 1 completed: Basic database connectivity validated');

      // Phase 2: Additional startup-specific comprehensive health checks
      logger.info('Phase 2: Performing comprehensive startup health checks');
      await performStartupHealthChecks();
      logger.info('Phase 2 completed: All startup health checks passed');

      // Phase 3: Connection pool warm-up and validation
      logger.info('Phase 3: Connection pool warm-up and validation');
      await warmUpConnectionPool();
      logger.info('Phase 3 completed: Connection pool is ready');

      logger.info('✅ Database connection health validation completed successfully', {
        host: databaseConfig.host,
        database: databaseConfig.database,
        environment: databaseConfig.environment,
        validationPhases: ['Basic Connectivity', 'Health Checks', 'Pool Warm-up'],
        status: 'All systems operational',
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as any)?.code;

      // Enhanced error logging with detailed diagnostic information
      logger.error('❌ Database connection health validation failed after all retry attempts', {
        error: errorMessage,
        errorCode,
        host: databaseConfig.host,
        database: databaseConfig.database,
        port: databaseConfig.port,
        username: databaseConfig.username,
        environment: databaseConfig.environment,
        sslMode: databaseConfig.ssl.mode,
        poolConfig: {
          min: databaseConfig.pool.min,
          max: databaseConfig.pool.max,
          connectionTimeoutMs: databaseConfig.pool.connectionTimeoutMillis,
        },
        retryAttempts: databaseConfig.health.retryAttempts,
        fallbackMode: 'in-memory repositories',
        troubleshooting: {
          checkDatabase: 'Verify PostgreSQL server is running and accessible',
          checkCredentials: 'Verify database credentials and permissions',
          checkNetwork: 'Verify network connectivity and firewall settings',
          checkSSL: 'Verify SSL configuration if using secure connections',
        },
      });

      // Provide specific error messages based on error type
      let specificErrorMessage = 'Database connection failed';
      if (errorCode === 'ECONNREFUSED') {
        specificErrorMessage = 'Database connection refused - check if PostgreSQL server is running';
      } else if (errorCode === 'ENOTFOUND') {
        specificErrorMessage = 'Database host not found - check host configuration';
      } else if (errorCode === 'ECONNRESET') {
        specificErrorMessage = 'Database connection was reset - check network stability';
      } else if (errorCode === '28P01') {
        specificErrorMessage = 'Database authentication failed - check credentials';
      } else if (errorCode === '3D000') {
        specificErrorMessage = 'Database does not exist - verify database name';
      } else if (errorCode === 'ETIMEDOUT') {
        specificErrorMessage = 'Database connection timed out - check network and timeout settings';
      }

      // Environment-specific error handling
      if (databaseConfig.environment === 'production') {
        logger.error('🚨 CRITICAL: Database connection is required in production environment', {
          action: 'Application startup will fail',
          recommendation: 'Fix database connectivity before proceeding',
        });

        // In production, fail fast with detailed error information
        const productionError = new Error(
          `Production database connection failed: ${specificErrorMessage}. ` +
          `Original error: ${errorMessage}`
        );

        // Preserve original error details
        (productionError as any).code = errorCode;
        (productionError as any).originalError = error;

        throw productionError;
      }

      // Non-production: Log warning and continue with fallback
      logger.warn('⚠️  Database connection failed - continuing with in-memory fallback', {
        environment: databaseConfig.environment,
        specificError: specificErrorMessage,
        originalError: errorMessage,
        fallbackNote: 'Application will use in-memory storage until database connection is restored',
        impact: 'Data will not persist across server restarts',
        recommendation: 'Fix database connectivity to enable full persistence features',
      });
    }
  } else {
    logger.info('📋 Database not configured - using in-memory repositories', {
      mode: 'Development/Testing',
      storage: 'In-memory (non-persistent)',
      note: 'Data will not persist across server restarts',
      enablePostgreSQL: {
        description: 'Set DATABASE_URL or discrete DB_* environment variables to enable PostgreSQL persistence',
        requiredVars: ['DATABASE_URL or (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)'],
        optionalVars: ['DB_PORT', 'DB_POOL_MIN', 'DB_POOL_MAX', 'DB_SSL_MODE'],
        examples: {
          databaseUrl: 'postgres://username:password@localhost:5432/database_name',
          discreteVars: {
            DB_HOST: 'localhost',
            DB_PORT: '5432',
            DB_USER: 'qa_copilot_user',
            DB_PASSWORD: 'secure_password',
            DB_NAME: 'qa_copilot',
          }
        }
      }
    });
  }
}

// Perform comprehensive startup-specific health checks
// Validates: Requirements 1.3, 1.4
async function performStartupHealthChecks(): Promise<void> {
  try {
    // Import required database functions
    const { getPoolStats } = await import('./client');

    // Check 1: Connection pool initialization and statistics
    logger.debug('Health Check 1: Validating connection pool initialization');
    const poolStats = getPoolStats();
    if (poolStats) {
      logger.info('Connection pool statistics validated', {
        totalConnections: poolStats.totalCount,
        idleConnections: poolStats.idleCount,
        waitingClients: poolStats.waitingCount,
        poolHealth: poolStats.totalCount > 0 ? 'healthy' : 'warning',
      });

      // Validate pool health - ensure we have active connections
      if (poolStats.totalCount === 0) {
        throw new Error('Connection pool has no active connections - pool initialization may have failed');
      }

      // Warn if pool seems under-provisioned
      if (poolStats.totalCount < databaseConfig.pool.min) {
        logger.warn('Connection pool has fewer connections than configured minimum', {
          actual: poolStats.totalCount,
          expected: databaseConfig.pool.min,
        });
      }
    } else {
      throw new Error('Unable to retrieve connection pool statistics - pool may not be initialized');
    }

    // Check 2: Database server version and compatibility
    logger.debug('Health Check 2: Validating database server version and compatibility');
    await withRetry(async () => {
      const { pool } = await import('./client');
      const client = await pool.connect();
      try {
        const versionResult = await client.query('SELECT version()');
        const postgresVersion = versionResult.rows[0]?.version || 'Unknown';

        logger.info('Database server version validated', {
          version: postgresVersion,
          compatibility: 'PostgreSQL 12+ recommended',
        });

        // Check for minimum PostgreSQL version (basic check)
        if (postgresVersion.includes('PostgreSQL')) {
          const versionMatch = postgresVersion.match(/PostgreSQL\s+(\d+)\.(\d+)/);
          if (versionMatch) {
            const majorVersion = parseInt(versionMatch[1]);
            if (majorVersion < 12) {
              logger.warn('PostgreSQL version may be outdated', {
                currentVersion: majorVersion,
                recommendedVersion: '12+',
                note: 'Some features may not work optimally',
              });
            }
          }
        }
      } finally {
        client.release();
      }
    }, 'database version check');

    // Check 3: Database permissions and basic operations
    logger.debug('Health Check 3: Validating database permissions and operations');
    await withRetry(async () => {
      const { pool } = await import('./client');
      const client = await pool.connect();
      try {
        // Test SELECT permissions
        await client.query('SELECT 1 as permission_check');

        // Test transaction capability (without creating actual tables)
        await client.query('BEGIN');
        await client.query('SELECT 1 as transaction_check');
        await client.query('ROLLBACK');

        logger.debug('Database permissions and transaction capabilities validated');
      } finally {
        client.release();
      }
    }, 'database permissions check');

    // Check 4: Connection timeout and responsiveness
    logger.debug('Health Check 4: Testing connection responsiveness and timeout handling');
    const startTime = Date.now();
    await withRetry(async () => {
      const { pool } = await import('./client');
      const client = await pool.connect();
      try {
        // Test with a slightly more complex query to ensure responsiveness
        const result = await client.query(`
          SELECT
            current_timestamp as server_time,
            current_database() as database_name,
            current_user as current_user,
            version() as server_info
        `);

        const responseTime = Date.now() - startTime;

        logger.debug('Connection responsiveness validated', {
          responseTimeMs: responseTime,
          serverTime: result.rows[0]?.server_time,
          databaseName: result.rows[0]?.database_name,
          currentUser: result.rows[0]?.current_user,
        });

        // Warn if response time is concerning
        if (responseTime > 5000) { // 5 seconds
          logger.warn('Database response time is slow', {
            responseTimeMs: responseTime,
            recommendation: 'Check database server performance and network latency',
          });
        }
      } finally {
        client.release();
      }
    }, 'connection responsiveness check');

    // Check 5: SSL/TLS connection security validation (if enabled)
    if (databaseConfig.ssl.mode !== 'disable') {
      logger.debug('Health Check 5: Validating SSL/TLS connection security');
      await withRetry(async () => {
        const { pool } = await import('./client');
        const client = await pool.connect();
        try {
          // Query SSL connection status
          const sslResult = await client.query(`
            SELECT
              ssl,
              cipher,
              bits,
              client_addr
            FROM pg_stat_ssl
            WHERE pid = pg_backend_pid()
          `);

          if (sslResult.rows.length > 0) {
            const sslInfo = sslResult.rows[0];
            logger.info('SSL/TLS connection validated', {
              sslEnabled: sslInfo.ssl,
              cipher: sslInfo.cipher,
              bits: sslInfo.bits,
              clientAddr: sslInfo.client_addr,
              sslMode: databaseConfig.ssl.mode,
            });

            if (!sslInfo.ssl && databaseConfig.ssl.mode === 'require') {
              throw new Error('SSL is required but connection is not encrypted');
            }
          } else {
            logger.debug('SSL information not available or not supported by server version');
          }
        } finally {
          client.release();
        }
      }, 'SSL connection validation');
    }

    logger.info('✅ All startup health checks completed successfully', {
      checksPerformed: [
        'Connection Pool Initialization',
        'Database Server Version',
        'Database Permissions',
        'Connection Responsiveness',
        ...(databaseConfig.ssl.mode !== 'disable' ? ['SSL/TLS Security'] : []),
      ],
      totalChecks: databaseConfig.ssl.mode !== 'disable' ? 5 : 4,
      status: 'All systems operational',
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Startup health checks failed', {
      error: errorMessage,
      phase: 'Database health validation',
      impact: 'May affect database reliability',
    });

    // Re-throw to trigger the retry logic in the parent function
    throw new Error(`Health checks failed: ${errorMessage}`);
  }
}

// Warm up connection pool to ensure minimum connections are established
// Validates: Requirements 1.1, 1.2
async function warmUpConnectionPool(): Promise<void> {
  try {
    logger.debug('Starting connection pool warm-up');

    const { pool } = await import('./client');
    const connections: any[] = [];

    // Create minimum number of connections to warm up the pool
    const warmUpCount = Math.min(databaseConfig.pool.min, 3); // Don't create too many

    for (let i = 0; i < warmUpCount; i++) {
      try {
        const client = await pool.connect();
        connections.push(client);

        // Test each connection with a simple query
        await client.query('SELECT 1');
        logger.debug(`Connection ${i + 1}/${warmUpCount} established and tested`);
      } catch (error) {
        logger.warn(`Failed to establish warm-up connection ${i + 1}/${warmUpCount}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't fail the entire warm-up if one connection fails
      }
    }

    // Release all warm-up connections back to the pool
    connections.forEach(client => {
      try {
        client.release();
      } catch (error) {
        logger.warn('Failed to release warm-up connection', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Get final pool statistics
    const { getPoolStats } = await import('./client');
    const finalStats = getPoolStats();

    logger.info('Connection pool warm-up completed', {
      warmUpConnections: warmUpCount,
      finalPoolStats: finalStats ? {
        total: finalStats.totalCount,
        idle: finalStats.idleCount,
        waiting: finalStats.waitingCount,
      } : 'unavailable',
      status: 'Pool ready for production traffic',
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.warn('Connection pool warm-up encountered issues', {
      error: errorMessage,
      impact: 'Pool will still function, but initial connections may be slower',
      recommendation: 'Monitor pool performance during initial load',
    });

    // Don't fail startup for warm-up issues, just log warnings
  }
}
