/**
 * Database Connection Module — AI QA Copilot
 *
 * The single entry point for PostgreSQL access. Exports a Drizzle client (`db`) bound to the full
 * schema, plus the underlying `pg` pool for raw access and a `closeDb()` for graceful shutdown.
 *
 * Repositories receive `db` (or a transaction client) — never a global. Nothing imports `pg` directly
 * outside this module. See `docs/database-planning.md` §2 (async-only, pool at process level).
 *
 * Features comprehensive connection management with retry logic, health checks, and proper error handling.
 * Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.6, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6
 */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import logger from "../logger";
import * as schema from "./schema";
import { databaseConfig, getPoolConfig, isDatabaseConfigured, buildConnectionString } from "./config";

let _pool: Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;

/**
 * The in-flight (or settled) promise from `initializeDatabase()`. Stored so standalone scripts can
 * `await ensureDbInitialized()` before using `db` — otherwise they race `_db` while it's still null.
 */
let initPromise: Promise<void> | null = null;

/**
 * Initialize database connection with enhanced retry logic and health monitoring
 */
function initializeDatabase(): Promise<void> {
    if (!isDatabaseConfigured()) {
        logger.warn(
            "Database configuration is incomplete — database features are disabled until properly configured.",
        );
        return Promise.resolve();
    }

    // Use enhanced retry logic for database initialization. The returned promise is stored so that
    // standalone scripts can await it via `ensureDbInitialized()` before touching `db`/repositories —
    // `initializeDatabase()` is async and NOT awaited at import time.
    initPromise = withConnectionRetry(async () => {
        const poolConfig = getPoolConfig(databaseConfig);
        _pool = new Pool(poolConfig);

        // Enhanced error handling with retry-aware logging
        _pool.on("error", (err) => {
            logger.error("Unexpected error on idle PostgreSQL client", {
                message: err.message,
                stack: err.stack,
                code: (err as any).code,
                isRetryableError: isRetryableError(err),
            });
        });

        _pool.on("connect", (client) => {
            logger.debug("New PostgreSQL client connected");

            // Set statement timeout on new connections with retry logic
            withQueryRetry(
                () => client.query(`SET statement_timeout = ${databaseConfig.pool.statementTimeoutMillis}`),
                "set statement timeout"
            ).catch(err => {
                logger.warn("Failed to set statement timeout on new connection", {
                    error: err.message,
                    isRetryableError: isRetryableError(err),
                });
            });
        });

        _pool.on("acquire", () => {
            logger.debug("PostgreSQL client acquired from pool");
        });

        _pool.on("release", () => {
            logger.debug("PostgreSQL client released back to pool");
        });

        // Test initial connection before creating Drizzle client
        const testClient = await _pool.connect();
        try {
            await testClient.query('SELECT 1');
            logger.debug("Initial database connection test successful");
        } finally {
            testClient.release();
        }

        _db = drizzle(_pool, { schema });

        // Start health monitoring
        startHealthCheck();

        logger.info("Database connection pool initialized successfully with enhanced retry logic", {
            host: databaseConfig.host,
            database: databaseConfig.database,
            poolMin: databaseConfig.pool.min,
            poolMax: databaseConfig.pool.max,
            sslMode: databaseConfig.ssl.mode,
            retryAttempts: databaseConfig.health.retryAttempts,
            retryBackoff: databaseConfig.health.retryBackoff,
        });
    }, "database initialization").catch(error => {
        logger.error("Failed to initialize database connection after retries", {
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    });

    return initPromise;
}

/**
 * Start periodic health checks with enhanced retry logic
 */
function startHealthCheck() {
    if (healthCheckInterval || !_pool) {
        return;
    }

    healthCheckInterval = setInterval(async () => {
        try {
            await withConnectionRetry(
                () => validateConnection(),
                "periodic health check"
            );
            logger.debug("Database health check passed");
        } catch (error) {
            logger.error("Database health check failed after retries", {
                error: error instanceof Error ? error.message : String(error),
                isRetryableError: error instanceof Error ? isRetryableError(error) : false,
            });
        }
    }, databaseConfig.health.checkInterval);
}

/**
 * Validate database connection health with enhanced retry logic
 */
export async function validateConnection(): Promise<void> {
    if (!_pool) {
        throw new Error("Database pool is not initialized");
    }

    return withQueryRetry(async () => {
        const client = await _pool!.connect();
        try {
            const result = await client.query("SELECT 1 as health_check");
            if (result.rows[0]?.health_check !== 1) {
                throw new Error("Health check query returned unexpected result");
            }
        } finally {
            client.release();
        }
    }, "connection health validation");
}

/**
 * Enhanced connection validation for startup with comprehensive checks and retry logic
 * Validates: Requirements 1.3, 1.4
 */
export async function validateConnectionOnStartup(): Promise<void> {
    if (!_pool) {
        throw new Error("Database pool is not initialized");
    }

    return withConnectionRetry(async () => {
        const client = await _pool!.connect();
        try {
            // Enhanced health check with multiple validation points
            const startTime = Date.now();

            // Basic connectivity test
            const result = await client.query("SELECT 1 as health_check");
            if (result.rows[0]?.health_check !== 1) {
                throw new Error("Health check query returned unexpected result");
            }

            // Validate connection timing
            const connectionTime = Date.now() - startTime;
            if (connectionTime > 10000) { // 10 seconds
                logger.warn('Database connection is slow during startup', {
                    connectionTimeMs: connectionTime,
                    threshold: 10000,
                });
            }

            // Test transaction capability with retry logic
            await withTransactionRetry(async () => {
                await client.query("BEGIN");
                await client.query("SELECT 'transaction_test' as test");
                await client.query("ROLLBACK");
            }, "startup transaction test");

            logger.debug('Enhanced startup connection validation completed', {
                connectionTimeMs: connectionTime,
                checks: ['Basic Query', 'Transaction Capability'],
            });

        } finally {
            client.release();
        }
    }, "startup connection validation");
}

/**
 * Retry configuration options for database operations
 */
export interface RetryOptions {
    /** Maximum number of retry attempts (default: from config) */
    maxAttempts?: number;
    /** Initial delay between retries in milliseconds (default: from config) */
    initialDelay?: number;
    /** Maximum delay between retries in milliseconds (default: 30000) */
    maxDelay?: number;
    /** Backoff strategy: 'linear', 'exponential', or 'custom' (default: from config) */
    backoffStrategy?: 'linear' | 'exponential' | 'custom';
    /** Custom backoff multiplier for exponential strategy (default: 2) */
    backoffMultiplier?: number;
    /** Random jitter factor to prevent thundering herd (0-1, default: 0.1) */
    jitterFactor?: number;
    /** Condition to determine if error is retryable */
    isRetryableError?: (error: Error) => boolean;
    /** Timeout for each individual operation attempt in milliseconds */
    operationTimeoutMs?: number;
}

/**
 * Default retry configuration based on database config
 */
const getDefaultRetryOptions = (): Required<RetryOptions> => ({
    maxAttempts: databaseConfig.health.retryAttempts,
    initialDelay: databaseConfig.health.retryDelay,
    maxDelay: 30000, // 30 seconds max delay
    backoffStrategy: databaseConfig.health.retryBackoff as 'linear' | 'exponential',
    backoffMultiplier: 2,
    jitterFactor: 0.1,
    isRetryableError: isRetryableError,
    operationTimeoutMs: databaseConfig.pool.statementTimeoutMillis,
});

/**
 * Determine if an error is retryable based on error type and characteristics
 */
function isRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    const errorCode = (error as any).code;

    // Connection-related errors (retryable)
    const retryableConnectionCodes = [
        'ECONNREFUSED',  // Connection refused
        'ECONNRESET',    // Connection reset
        'ENOTFOUND',     // Host not found (DNS issues)
        'ETIMEDOUT',     // Connection timeout
        'ECONNABORTED',  // Connection aborted
        'EPIPE',         // Broken pipe
        'EHOSTUNREACH',  // Host unreachable
        'ENETUNREACH',   // Network unreachable
    ];

    // PostgreSQL-specific retryable errors
    const retryablePgCodes = [
        '08000', // connection_exception
        '08003', // connection_does_not_exist
        '08006', // connection_failure
        '08001', // sqlclient_unable_to_establish_sqlconnection
        '08004', // sqlserver_rejected_establishment_of_sqlconnection
        '53300', // too_many_connections
        '57P01', // admin_shutdown
        '57P02', // crash_shutdown
        '57P03', // cannot_connect_now
        '40001', // serialization_failure (deadlock)
        '40P01', // deadlock_detected
    ];

    // Check for retryable error codes
    if (retryableConnectionCodes.includes(errorCode)) {
        return true;
    }

    if (retryablePgCodes.includes(errorCode)) {
        return true;
    }

    // Check for retryable error messages
    const retryableMessages = [
        'connection terminated',
        'server closed the connection',
        'connection lost',
        'connection reset',
        'timeout',
        'deadlock detected',
        'serialization failure',
        'could not connect to server',
        'the database system is shutting down',
        'the database system is starting up',
        'too many connections',
        'connection pool exhausted',
    ];

    return retryableMessages.some(msg => errorMessage.includes(msg));
}

/**
 * Non-retryable errors that should fail immediately
 */
function isNonRetryableError(error: Error): boolean {
    const errorCode = (error as any).code;

    // PostgreSQL constraint and data errors (non-retryable)
    const nonRetryablePgCodes = [
        '23505', // unique_violation
        '23503', // foreign_key_violation
        '23502', // not_null_violation
        '23514', // check_violation
        '42501', // insufficient_privilege
        '42601', // syntax_error
        '42703', // undefined_column
        '42P01', // undefined_table
        '42P02', // undefined_parameter
        '2201E', // invalid_argument_for_logarithm
        '22012', // division_by_zero
        '22001', // string_data_right_truncation
    ];

    return nonRetryablePgCodes.includes(errorCode);
}

/**
 * Calculate delay with exponential backoff, jitter, and maximum cap
 */
function calculateDelay(
    attempt: number,
    initialDelay: number,
    backoffStrategy: 'linear' | 'exponential' | 'custom',
    backoffMultiplier: number,
    maxDelay: number,
    jitterFactor: number
): number {
    let delay: number;

    switch (backoffStrategy) {
        case 'linear':
            delay = initialDelay * attempt;
            break;
        case 'exponential':
            delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
            break;
        case 'custom':
            // Custom strategy: exponential with linear component for smoother scaling
            delay = initialDelay * (Math.pow(backoffMultiplier, attempt - 1) + (attempt - 1));
            break;
        default:
            delay = initialDelay * Math.pow(2, attempt - 1);
    }

    // Apply maximum delay cap
    delay = Math.min(delay, maxDelay);

    // Add jitter to prevent thundering herd effect
    const jitter = delay * jitterFactor * (Math.random() * 2 - 1); // Random between -jitterFactor and +jitterFactor
    delay = Math.max(100, delay + jitter); // Ensure minimum 100ms delay

    return Math.round(delay);
}

/**
 * Execute operation with comprehensive retry logic and exponential backoff
 * Supports configurable retry parameters, error classification, and operation timeouts
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string = "database operation",
    options: RetryOptions = {}
): Promise<T> {
    const config = { ...getDefaultRetryOptions(), ...options };
    let lastError: Error | null = null;
    const startTime = Date.now();

    logger.debug(`Starting ${operationName} with retry configuration`, {
        maxAttempts: config.maxAttempts,
        initialDelay: config.initialDelay,
        backoffStrategy: config.backoffStrategy,
        maxDelay: config.maxDelay,
    });

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        try {
            // Wrap operation with a timeout if specified. The timeout timer is cleared in `finally`
            // so it does not keep the event loop alive (and block graceful shutdown) after the
            // operation resolves/rejects first — the normal case on every successful call.
            let result: T;
            if (config.operationTimeoutMs) {
                let timer: ReturnType<typeof setTimeout> | undefined;
                try {
                    result = await Promise.race([
                        operation(),
                        new Promise<never>((_, reject) => {
                            timer = setTimeout(
                                () => reject(new Error(`Operation timeout after ${config.operationTimeoutMs}ms`)),
                                config.operationTimeoutMs,
                            );
                        }),
                    ]);
                } finally {
                    if (timer) clearTimeout(timer);
                }
            } else {
                result = await operation();
            }

            // Success - log if retries were attempted
            if (attempt > 1) {
                const totalTime = Date.now() - startTime;
                logger.info(`${operationName} succeeded after ${attempt} attempts`, {
                    totalAttempts: attempt,
                    totalTimeMs: totalTime,
                    finalAttempt: attempt,
                });
            }

            return result;

        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if error is non-retryable
            if (isNonRetryableError(lastError)) {
                logger.error(`${operationName} failed with non-retryable error`, {
                    error: lastError.message,
                    errorCode: (lastError as any).code,
                    attempt,
                });
                throw lastError;
            }

            // Check if error is retryable
            const shouldRetry = config.isRetryableError(lastError);

            // If this is the last attempt or error is not retryable, throw
            if (attempt === config.maxAttempts || !shouldRetry) {
                const totalTime = Date.now() - startTime;
                logger.error(`${operationName} failed after ${attempt} attempts`, {
                    error: lastError.message,
                    errorCode: (lastError as any).code,
                    attempts: attempt,
                    maxAttempts: config.maxAttempts,
                    totalTimeMs: totalTime,
                    isRetryableError: shouldRetry,
                });
                throw lastError;
            }

            // Calculate delay for next attempt
            const delay = calculateDelay(
                attempt,
                config.initialDelay,
                config.backoffStrategy,
                config.backoffMultiplier,
                config.maxDelay,
                config.jitterFactor
            );

            logger.warn(`${operationName} failed, retrying in ${delay}ms`, {
                error: lastError.message,
                errorCode: (lastError as any).code,
                attempt,
                maxAttempts: config.maxAttempts,
                delayMs: delay,
                backoffStrategy: config.backoffStrategy,
                isRetryableError: shouldRetry,
            });

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // This should never be reached due to the logic above, but include for completeness
    throw lastError || new Error(`${operationName} failed after ${config.maxAttempts} attempts`);
}

/**
 * Enhanced retry function specifically for connection operations
 * Uses more aggressive retry settings suitable for connection establishment
 */
export async function withConnectionRetry<T>(
    operation: () => Promise<T>,
    operationName: string = "database connection"
): Promise<T> {
    const connectionRetryOptions: RetryOptions = {
        maxAttempts: Math.max(5, databaseConfig.health.retryAttempts), // Minimum 5 attempts for connections
        initialDelay: 500, // Start with shorter delay for connections
        maxDelay: 10000, // Max 10 seconds for connection attempts
        backoffStrategy: 'exponential',
        backoffMultiplier: 1.5, // Gentler exponential growth for connections
        jitterFactor: 0.2, // More jitter for connection attempts
        operationTimeoutMs: databaseConfig.pool.connectionTimeoutMillis,
        isRetryableError: (error: Error) => {
            // More permissive retry logic for connection operations
            return isRetryableError(error) ||
                error.message.toLowerCase().includes('connection') ||
                error.message.toLowerCase().includes('network');
        },
    };

    return withRetry(operation, operationName, connectionRetryOptions);
}

/**
 * Specialized retry function for query operations
 * Uses retry settings optimized for query execution
 */
export async function withQueryRetry<T>(
    operation: () => Promise<T>,
    operationName: string = "database query"
): Promise<T> {
    const queryRetryOptions: RetryOptions = {
        maxAttempts: Math.min(3, databaseConfig.health.retryAttempts), // Limited retries for queries
        initialDelay: databaseConfig.health.retryDelay,
        maxDelay: 5000, // Max 5 seconds for query retries
        backoffStrategy: 'linear', // Linear backoff for queries to avoid long delays
        jitterFactor: 0.05, // Minimal jitter for queries
        operationTimeoutMs: databaseConfig.pool.statementTimeoutMillis,
        isRetryableError: (error: Error) => {
            // Conservative retry logic for queries - only retry clear transient errors
            const errorCode = (error as any).code;
            return ['40001', '40P01', '57P01', '57P02', '57P03', '53300'].includes(errorCode) ||
                isRetryableError(error);
        },
    };

    return withRetry(operation, operationName, queryRetryOptions);
}

/**
 * Specialized retry function for transaction operations
 * Uses retry settings optimized for transaction management
 */
export async function withTransactionRetry<T>(
    operation: () => Promise<T>,
    operationName: string = "database transaction"
): Promise<T> {
    const transactionRetryOptions: RetryOptions = {
        maxAttempts: 5, // More attempts for transactions due to potential deadlocks
        initialDelay: 100, // Start with very short delay for transactions
        maxDelay: 2000, // Keep transaction retries short
        backoffStrategy: 'exponential',
        backoffMultiplier: 1.5,
        jitterFactor: 0.3, // High jitter to reduce collision probability
        operationTimeoutMs: Math.max(30000, databaseConfig.pool.statementTimeoutMillis), // At least 30s for transactions
        isRetryableError: (error: Error) => {
            // Focus on serialization and deadlock errors for transactions
            const errorCode = (error as any).code;
            return ['40001', '40P01'].includes(errorCode) || // serialization_failure, deadlock_detected
                isRetryableError(error);
        },
    };

    return withRetry(operation, operationName, transactionRetryOptions);
}

// Initialize database on module load
initializeDatabase();

// Export helper functions
function getPool() {
    if (!_pool) {
        throw new Error("Database pool is not initialized. Check your database configuration.");
    }
    return _pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
    if (!_db) {
        throw new Error("Database is not initialized. Check your database configuration.");
    }
    return _db;
}

/**
 * Await the background initialization kicked off at module load.
 *
 * `initializeDatabase()` runs at import time but is async and NOT awaited, so standalone scripts
 * (db:seed, db:reset, db:reset-admin-password) MUST `await ensureDbInitialized()` before touching
 * `db`/repositories — otherwise they race `_db` while it's still null and hit
 * "Database is not initialized". The long-running server (index.ts) doesn't need this: its startup
 * latency lets init complete before the first request arrives.
 *
 * Resolves immediately when the database isn't configured (callers then get a clear error from
 * `getDb()` / `getPool()`).
 */
export async function ensureDbInitialized(): Promise<void> {
    if (initPromise) {
        await initPromise;
    }
}

// Export a non-null pool that throws if not initialized
export const pool = new Proxy({} as Pool, {
    get(target, prop) {
        const actualPool = getPool();
        return actualPool[prop as keyof typeof actualPool];
    }
});

// For backward compatibility, export a non-null db that throws if not initialized
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
    get(target, prop) {
        const actualDb = getDb();
        return actualDb[prop as keyof typeof actualDb];
    }
});

/** True when database is configured and connection pool is initialized */
export const isDbConfigured = (): boolean => isDatabaseConfigured() && _pool !== null && _db !== null;

/** Shared Drizzle client type (the main `db` and any transaction client both satisfy this). */
export type DbClient = NodePgDatabase<typeof schema>;

/**
 * Graceful shutdown — call on SIGTERM/SIGINT before process exit.
 * Validates: Requirement 1.6
 */
export async function closeDb(): Promise<void> {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
    }

    if (_pool) {
        logger.info("Closing database connection pool...");
        try {
            await _pool.end();
            logger.info("Database connection pool closed successfully");
        } catch (error) {
            logger.error("Error closing database connection pool", {
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            _pool = null;
            _db = null;
        }
    }
}

/**
 * Get connection pool statistics with health indicators
 */
export function getPoolStats() {
    if (!_pool) {
        return null;
    }

    const stats = {
        totalCount: _pool.totalCount,
        idleCount: _pool.idleCount,
        waitingCount: _pool.waitingCount,
    };

    return {
        ...stats,
        // Add health indicators
        healthStatus: getPoolHealthStatus(stats),
        utilizationPercent: Math.round((stats.totalCount / databaseConfig.pool.max) * 100),
        isHealthy: stats.totalCount > 0 && stats.waitingCount < databaseConfig.pool.max,
    };
}

/**
 * Determine pool health status based on statistics
 */
function getPoolHealthStatus(stats: { totalCount: number; idleCount: number; waitingCount: number }) {
    if (stats.totalCount === 0) {
        return 'critical';
    }

    if (stats.waitingCount > stats.totalCount) {
        return 'warning';
    }

    if (stats.idleCount === 0 && stats.totalCount === databaseConfig.pool.max) {
        return 'warning';
    }

    return 'healthy';
}

/**
 * Test database connection with timeout, detailed error reporting, and enhanced retry logic
 * Used specifically during startup validation
 */
export async function testDatabaseConnectivity(): Promise<{
    success: boolean;
    connectionTime: number;
    serverInfo?: {
        version: string;
        databaseName: string;
        currentUser: string;
        serverTime: string;
    };
    error?: string;
    retryAttempts?: number;
}> {
    const startTime = Date.now();
    let totalAttempts = 1;

    try {
        if (!_pool) {
            throw new Error("Database pool is not initialized");
        }

        const result = await withConnectionRetry(async () => {
            totalAttempts++; // Track retry attempts
            const client = await _pool!.connect();
            try {
                // Get comprehensive server information
                const result = await client.query(`
                    SELECT 
                        version() as version,
                        current_database() as database_name,
                        current_user as current_user,
                        current_timestamp as server_time
                `);

                return result.rows[0];
            } finally {
                client.release();
            }
        }, "database connectivity test");

        const connectionTime = Date.now() - startTime;
        const serverInfo = result;

        return {
            success: true,
            connectionTime,
            retryAttempts: totalAttempts - 1, // Subtract initial attempt
            serverInfo: {
                version: serverInfo.version,
                databaseName: serverInfo.database_name,
                currentUser: serverInfo.current_user,
                serverTime: serverInfo.server_time,
            },
        };
    } catch (error) {
        const connectionTime = Date.now() - startTime;
        return {
            success: false,
            connectionTime,
            retryAttempts: totalAttempts - 1,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export default getDb;