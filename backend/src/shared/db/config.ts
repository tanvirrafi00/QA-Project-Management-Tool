/**
 * Database Configuration Module — AI QA Copilot
 * 
 * Provides comprehensive PostgreSQL configuration with environment variable validation,
 * connection parameter management, and support for different environments.
 * 
 * Validates: Requirements 1.5, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6
 */

import { z } from 'zod';
import logger from '../logger';

// SSL Mode validation
const sslModeSchema = z.enum(['disable', 'prefer', 'require', 'verify-ca', 'verify-full']);

// Environment profile validation 
const environmentSchema = z.enum(['development', 'test', 'production']);

// Database configuration schema
const dbConfigSchema = z.object({
    // Primary connection configuration
    databaseUrl: z.string().url().optional(),

    // Discrete connection parameters
    host: z.string().default('localhost'),
    port: z.coerce.number().int().min(1).max(65535).default(5432),
    database: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),

    // SSL configuration
    ssl: z.object({
        mode: sslModeSchema.default('disable'),
        ca: z.string().optional(),
        cert: z.string().optional(),
        key: z.string().optional(),
    }),

    // Connection pool configuration
    pool: z.object({
        // Basic pool sizing
        min: z.coerce.number().int().min(0).default(2),
        max: z.coerce.number().int().min(1).default(10),

        // Connection lifecycle timeouts
        idleTimeoutMillis: z.coerce.number().int().min(0).default(10000),
        connectionTimeoutMillis: z.coerce.number().int().min(0).default(5000),
        statementTimeoutMillis: z.coerce.number().int().min(0).default(30000),

        // Pool management timeouts
        acquireTimeoutMillis: z.coerce.number().int().min(1000).default(60000),
        createTimeoutMillis: z.coerce.number().int().min(1000).default(30000),
        destroyTimeoutMillis: z.coerce.number().int().min(1000).default(5000),
        reapIntervalMillis: z.coerce.number().int().min(1000).default(1000),

        // Connection validation and health
        validateOnBorrow: z.coerce.boolean().default(true),
        testOnCreate: z.coerce.boolean().default(true),
        maxWaitingClients: z.coerce.number().int().min(0).default(0), // 0 = unlimited

        // Performance and monitoring
        allowExitOnIdle: z.coerce.boolean().default(false),
        maxUses: z.coerce.number().int().min(0).default(7500), // 0 = unlimited
        maxLifetimeSeconds: z.coerce.number().int().min(0).default(1800), // 30 minutes

        // Application-level settings
        application_name: z.string().optional(),
        keepAlive: z.coerce.boolean().default(true),
        keepAliveInitialDelayMillis: z.coerce.number().int().min(0).default(0),
    }),

    // Environment-specific configuration
    environment: environmentSchema.default('development'),

    // Migration configuration
    migration: z.object({
        table: z.string().default('drizzle_migrations'),
        schema: z.string().default('public'),
    }),

    // Health check and retry configuration
    health: z.object({
        checkInterval: z.coerce.number().int().min(1000).default(30000),
        retryAttempts: z.coerce.number().int().min(1).default(3),
        retryDelay: z.coerce.number().int().min(100).default(1000),
        retryBackoff: z.enum(['linear', 'exponential']).default('exponential'),
    }),
});

export type DatabaseConfig = z.infer<typeof dbConfigSchema>;

/**
 * Load and validate database configuration from environment variables
 */
export function loadDatabaseConfig(): DatabaseConfig {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const environment = environmentSchema.parse(nodeEnv);

    // Determine database name based on environment
    const baseName = process.env.DB_NAME || 'qa_copilot';
    let databaseName = baseName;

    if (environment === 'test' && process.env.DB_NAME_TEST) {
        databaseName = process.env.DB_NAME_TEST;
    } else if (environment === 'development' && process.env.DB_NAME_DEVELOPMENT) {
        databaseName = process.env.DB_NAME_DEVELOPMENT;
    } else if (environment === 'production' && process.env.DB_NAME_PRODUCTION) {
        databaseName = process.env.DB_NAME_PRODUCTION;
    }

    const rawConfig = {
        databaseUrl: process.env.DATABASE_URL,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: databaseName,
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        ssl: {
            mode: process.env.DB_SSL_MODE,
            ca: process.env.DB_SSL_CA_PATH,
            cert: process.env.DB_SSL_CERT_PATH,
            key: process.env.DB_SSL_KEY_PATH,
        },
        pool: {
            // Basic pool sizing
            min: process.env.DB_POOL_MIN,
            max: process.env.DB_POOL_MAX,

            // Connection lifecycle timeouts
            idleTimeoutMillis: process.env.DB_POOL_IDLE_TIMEOUT,
            connectionTimeoutMillis: process.env.DB_POOL_CONNECTION_TIMEOUT,
            statementTimeoutMillis: process.env.DB_POOL_STATEMENT_TIMEOUT,

            // Pool management timeouts
            acquireTimeoutMillis: process.env.DB_POOL_ACQUIRE_TIMEOUT,
            createTimeoutMillis: process.env.DB_POOL_CREATE_TIMEOUT,
            destroyTimeoutMillis: process.env.DB_POOL_DESTROY_TIMEOUT,
            reapIntervalMillis: process.env.DB_POOL_REAP_INTERVAL,

            // Connection validation and health
            validateOnBorrow: process.env.DB_POOL_VALIDATE_ON_BORROW,
            testOnCreate: process.env.DB_POOL_TEST_ON_CREATE,
            maxWaitingClients: process.env.DB_POOL_MAX_WAITING_CLIENTS,

            // Performance and monitoring
            allowExitOnIdle: process.env.DB_POOL_ALLOW_EXIT_ON_IDLE,
            maxUses: process.env.DB_POOL_MAX_USES,
            maxLifetimeSeconds: process.env.DB_POOL_MAX_LIFETIME_SECONDS,

            // Application-level settings
            application_name: process.env.DB_APPLICATION_NAME,
            keepAlive: process.env.DB_POOL_KEEP_ALIVE,
            keepAliveInitialDelayMillis: process.env.DB_POOL_KEEP_ALIVE_INITIAL_DELAY,
        },
        environment,
        migration: {
            table: process.env.DB_MIGRATION_TABLE,
            schema: process.env.DB_MIGRATION_SCHEMA,
        },
        health: {
            checkInterval: process.env.DB_HEALTH_CHECK_INTERVAL,
            retryAttempts: process.env.DB_CONNECTION_RETRY_ATTEMPTS,
            retryDelay: process.env.DB_CONNECTION_RETRY_DELAY,
            retryBackoff: process.env.DB_CONNECTION_RETRY_BACKOFF,
        },
    };

    try {
        const config = dbConfigSchema.parse(rawConfig);

        // Validate required environment variables on startup
        validateRequiredConfig(config);

        return config;
    } catch (error) {
        if (error instanceof z.ZodError) {
            const fieldErrors = error.issues.map((err: any) => `${err.path.join('.')}: ${err.message}`);
            logger.error('Database configuration validation failed:', fieldErrors);
            throw new Error(`Invalid database configuration: ${fieldErrors.join(', ')}`);
        }
        throw error;
    }
}

/**
 * Validate that required configuration is present based on the environment
 */
function validateRequiredConfig(config: DatabaseConfig): void {
    const errors: string[] = [];

    // If DATABASE_URL is provided, it takes precedence
    if (!config.databaseUrl) {
        // Validate discrete connection parameters
        if (!config.host) errors.push('DB_HOST is required when DATABASE_URL is not provided');
        if (!config.database) errors.push('Database name is required');
        if (!config.username) errors.push('DB_USER is required when DATABASE_URL is not provided');
        if (!config.password) errors.push('DB_PASSWORD is required when DATABASE_URL is not provided');
    }

    // SSL certificate validation
    if (config.ssl.mode === 'require' || config.ssl.mode === 'verify-ca' || config.ssl.mode === 'verify-full') {
        if (config.ssl.mode !== 'require' && !config.ssl.ca) {
            errors.push('DB_SSL_CA_PATH is required when SSL verification is enabled');
        }
        if (config.ssl.cert && !config.ssl.key) {
            errors.push('DB_SSL_KEY_PATH is required when DB_SSL_CERT_PATH is provided');
        }
        if (config.ssl.key && !config.ssl.cert) {
            errors.push('DB_SSL_CERT_PATH is required when DB_SSL_KEY_PATH is provided');
        }
    }

    // Pool configuration validation
    if (config.pool.min > config.pool.max) {
        errors.push('DB_POOL_MIN cannot be greater than DB_POOL_MAX');
    }

    // Timeout validation - ensure reasonable relationships
    if (config.pool.connectionTimeoutMillis > config.pool.acquireTimeoutMillis) {
        errors.push('DB_POOL_CONNECTION_TIMEOUT should not exceed DB_POOL_ACQUIRE_TIMEOUT');
    }

    if (config.pool.createTimeoutMillis > config.pool.acquireTimeoutMillis) {
        errors.push('DB_POOL_CREATE_TIMEOUT should not exceed DB_POOL_ACQUIRE_TIMEOUT');
    }

    // Validate that minimum pool size makes sense for the environment
    if (config.environment === 'production' && config.pool.min < 1) {
        errors.push('DB_POOL_MIN should be at least 1 in production for availability');
    }

    if (config.environment === 'production' && config.pool.max < 5) {
        logger.warn('DB_POOL_MAX is very low for production environment - consider increasing for better concurrency');
    }

    // Production-specific validation
    if (config.environment === 'production') {
        if (!config.databaseUrl && config.password === 'postgres') {
            errors.push('Default password should not be used in production');
        }
        if (config.ssl.mode === 'disable') {
            logger.warn('SSL is disabled in production environment - this is not recommended for security');
        }
    }

    if (errors.length > 0) {
        throw new Error(`Database configuration errors: ${errors.join(', ')}`);
    }
}

/**
 * Build PostgreSQL connection string from configuration
 */
export function buildConnectionString(config: DatabaseConfig): string {
    if (config.databaseUrl) {
        return config.databaseUrl;
    }

    const { host, port, database, username, password, ssl } = config;

    let connectionString = `postgres://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;

    const params: string[] = [];

    // Add SSL parameters
    if (ssl.mode !== 'disable') {
        params.push(`sslmode=${ssl.mode}`);

        if (ssl.ca) params.push(`sslrootcert=${ssl.ca}`);
        if (ssl.cert) params.push(`sslcert=${ssl.cert}`);
        if (ssl.key) params.push(`sslkey=${ssl.key}`);
    }

    if (params.length > 0) {
        connectionString += `?${params.join('&')}`;
    }

    return connectionString;
}

/**
 * Get connection pool configuration for pg.Pool
 */
export function getPoolConfig(config: DatabaseConfig) {
    const connectionString = buildConnectionString(config);

    return {
        connectionString,

        // Basic pool sizing
        min: config.pool.min,
        max: config.pool.max,

        // Connection lifecycle timeouts
        idleTimeoutMillis: config.pool.idleTimeoutMillis,
        connectionTimeoutMillis: config.pool.connectionTimeoutMillis,
        statement_timeout: config.pool.statementTimeoutMillis,

        // Pool management timeouts
        acquireTimeoutMillis: config.pool.acquireTimeoutMillis,
        createTimeoutMillis: config.pool.createTimeoutMillis,
        destroyTimeoutMillis: config.pool.destroyTimeoutMillis,
        reapIntervalMillis: config.pool.reapIntervalMillis,

        // Connection validation and health
        validateOnBorrow: config.pool.validateOnBorrow,
        testOnCreate: config.pool.testOnCreate,
        maxWaitingClients: config.pool.maxWaitingClients > 0 ? config.pool.maxWaitingClients : undefined,

        // Performance and monitoring
        allowExitOnIdle: config.pool.allowExitOnIdle,
        maxUses: config.pool.maxUses > 0 ? config.pool.maxUses : undefined,
        maxLifetimeSeconds: config.pool.maxLifetimeSeconds > 0 ? config.pool.maxLifetimeSeconds : undefined,

        // Application-level settings
        application_name: config.pool.application_name || `qa_copilot_${config.environment}`,
        keepAlive: config.pool.keepAlive,
        keepAliveInitialDelayMillis: config.pool.keepAliveInitialDelayMillis,
    };
}

/**
 * Check if database is configured and ready to use
 */
export function isDatabaseConfigured(): boolean {
    try {
        const config = loadDatabaseConfig();
        return !!(config.databaseUrl || (config.host && config.database && config.username));
    } catch {
        return false;
    }
}

/**
 * Get configuration for different environments
 */
export function getEnvironmentConfig(env: 'development' | 'test' | 'production'): Partial<DatabaseConfig> {
    const baseConfig = {
        development: {
            ssl: { mode: 'disable' as const },
            pool: {
                min: 2,
                max: 10,
                idleTimeoutMillis: 10000,
                connectionTimeoutMillis: 5000,
                statementTimeoutMillis: 30000,
                acquireTimeoutMillis: 60000,
                createTimeoutMillis: 30000,
                destroyTimeoutMillis: 5000,
                reapIntervalMillis: 1000,
                validateOnBorrow: true,
                testOnCreate: true,
                maxWaitingClients: 0,
                allowExitOnIdle: false,
                maxUses: 7500,
                maxLifetimeSeconds: 1800,
                keepAlive: true,
                keepAliveInitialDelayMillis: 0,
            },
            health: { checkInterval: 30000, retryAttempts: 3, retryDelay: 1000, retryBackoff: 'exponential' as const },
        },
        test: {
            ssl: { mode: 'disable' as const },
            pool: {
                min: 1,
                max: 5,
                idleTimeoutMillis: 5000,
                connectionTimeoutMillis: 3000,
                statementTimeoutMillis: 15000,
                acquireTimeoutMillis: 30000,
                createTimeoutMillis: 15000,
                destroyTimeoutMillis: 3000,
                reapIntervalMillis: 1000,
                validateOnBorrow: true,
                testOnCreate: true,
                maxWaitingClients: 0,
                allowExitOnIdle: true,
                maxUses: 1000,
                maxLifetimeSeconds: 300,
                keepAlive: false,
                keepAliveInitialDelayMillis: 0,
            },
            health: { checkInterval: 10000, retryAttempts: 1, retryDelay: 500, retryBackoff: 'linear' as const },
        },
        production: {
            ssl: { mode: 'require' as const },
            pool: {
                min: 5,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
                statementTimeoutMillis: 60000,
                acquireTimeoutMillis: 120000,
                createTimeoutMillis: 60000,
                destroyTimeoutMillis: 10000,
                reapIntervalMillis: 1000,
                validateOnBorrow: true,
                testOnCreate: true,
                maxWaitingClients: 100,
                allowExitOnIdle: false,
                maxUses: 10000,
                maxLifetimeSeconds: 3600,
                keepAlive: true,
                keepAliveInitialDelayMillis: 0,
            },
            health: { checkInterval: 60000, retryAttempts: 5, retryDelay: 2000, retryBackoff: 'exponential' as const },
        },
    };

    return baseConfig[env];
}

// Export the singleton configuration instance
export const databaseConfig = loadDatabaseConfig();

export default databaseConfig;