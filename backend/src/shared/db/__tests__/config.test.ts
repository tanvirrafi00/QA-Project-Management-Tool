/**
 * Database Configuration Tests — AI QA Copilot
 * 
 * Tests for enhanced connection pool configuration options including
 * comprehensive timeout settings, validation, and environment-specific defaults.
 * 
 * Validates: Requirements 15.2, 15.3 (connection pool configuration)
 */

import { loadDatabaseConfig, getPoolConfig, getEnvironmentConfig, DatabaseConfig } from '../config';

describe('Database Configuration - Connection Pool', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        // Reset environment variables before each test
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        // Restore original environment variables
        process.env = originalEnv;
    });

    describe('Basic Pool Configuration', () => {
        test('should use default pool settings when no environment variables are set', () => {
            process.env.NODE_ENV = 'development';
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_PASSWORD = 'test_pass';

            const config = loadDatabaseConfig();

            expect(config.pool.min).toBe(2);
            expect(config.pool.max).toBe(10);
            expect(config.pool.idleTimeoutMillis).toBe(10000);
            expect(config.pool.connectionTimeoutMillis).toBe(5000);
            expect(config.pool.statementTimeoutMillis).toBe(30000);
        });

        test('should parse custom pool settings from environment variables', () => {
            process.env.NODE_ENV = 'development';
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_PASSWORD = 'test_pass';
            process.env.DB_POOL_MIN = '5';
            process.env.DB_POOL_MAX = '25';
            process.env.DB_POOL_IDLE_TIMEOUT = '15000';
            process.env.DB_POOL_CONNECTION_TIMEOUT = '8000';

            const config = loadDatabaseConfig();

            expect(config.pool.min).toBe(5);
            expect(config.pool.max).toBe(25);
            expect(config.pool.idleTimeoutMillis).toBe(15000);
            expect(config.pool.connectionTimeoutMillis).toBe(8000);
        });

        test('should validate that min connections does not exceed max connections', () => {
            process.env.NODE_ENV = 'development';
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_PASSWORD = 'test_pass';
            process.env.DB_POOL_MIN = '15';
            process.env.DB_POOL_MAX = '10';

            expect(() => loadDatabaseConfig()).toThrow(/DB_POOL_MIN cannot be greater than DB_POOL_MAX/);
        });
    });

    describe('Advanced Pool Configuration', () => {
        test('should configure advanced timeout settings', () => {
            process.env.NODE_ENV = 'development';
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_PASSWORD = 'test_pass';
            process.env.DB_POOL_ACQUIRE_TIMEOUT = '120000';
            process.env.DB_POOL_CREATE_TIMEOUT = '45000';
            process.env.DB_POOL_DESTROY_TIMEOUT = '10000';
            process.env.DB_POOL_REAP_INTERVAL = '2000';

            const config = loadDatabaseConfig();

            expect(config.pool.acquireTimeoutMillis).toBe(120000);
            expect(config.pool.createTimeoutMillis).toBe(45000);
            expect(config.pool.destroyTimeoutMillis).toBe(10000);
            expect(config.pool.reapIntervalMillis).toBe(2000);
        });

        test('should configure validation and health settings', () => {
            process.env.NODE_ENV = 'development';
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_PASSWORD = 'test_pass';
            process.env.DB_POOL_VALIDATE_ON_BORROW = '';  // empty string is falsy
            process.env.DB_POOL_TEST_ON_CREATE = '';      // empty string is falsy
            process.env.DB_POOL_MAX_WAITING_CLIENTS = '50';

            const config = loadDatabaseConfig();

            expect(config.pool.validateOnBorrow).toBe(false);
            expect(config.pool.testOnCreate).toBe(false);
            expect(config.pool.maxWaitingClients).toBe(50);
        });

        test('should configure performance and lifecycle settings', () => {
            process.env.NODE_ENV = 'development';
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_PASSWORD = 'test_pass';
            process.env.DB_POOL_ALLOW_EXIT_ON_IDLE = 'true';
            process.env.DB_POOL_MAX_USES = '5000';
            process.env.DB_POOL_MAX_LIFETIME_SECONDS = '3600';

            const config = loadDatabaseConfig();

            expect(config.pool.allowExitOnIdle).toBe(true);
            expect(config.pool.maxUses).toBe(5000);
            expect(config.pool.maxLifetimeSeconds).toBe(3600);
        });

        test('should configure application-level settings', () => {
            process.env.NODE_ENV = 'development';
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_PASSWORD = 'test_pass';
            process.env.DB_APPLICATION_NAME = 'custom_app_name';
            process.env.DB_POOL_KEEP_ALIVE = '';  // empty string is falsy
            process.env.DB_POOL_KEEP_ALIVE_INITIAL_DELAY = '1000';

            const config = loadDatabaseConfig();

            expect(config.pool.application_name).toBe('custom_app_name');
            expect(config.pool.keepAlive).toBe(false);
            expect(config.pool.keepAliveInitialDelayMillis).toBe(1000);
        });
    });

    describe('Pool Configuration Validation', () => {
        test('should validate timeout relationships', () => {
            process.env.NODE_ENV = 'development';
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_PASSWORD = 'test_pass';
            process.env.DB_POOL_CONNECTION_TIMEOUT = '70000';
            process.env.DB_POOL_ACQUIRE_TIMEOUT = '60000';

            expect(() => loadDatabaseConfig())
                .toThrow(/DB_POOL_CONNECTION_TIMEOUT should not exceed DB_POOL_ACQUIRE_TIMEOUT/);
        });

        test('should validate create timeout relationship', () => {
            process.env.NODE_ENV = 'development';
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_PASSWORD = 'test_pass';
            process.env.DB_POOL_CREATE_TIMEOUT = '70000';
            process.env.DB_POOL_ACQUIRE_TIMEOUT = '60000';

            expect(() => loadDatabaseConfig())
                .toThrow(/DB_POOL_CREATE_TIMEOUT should not exceed DB_POOL_ACQUIRE_TIMEOUT/);
        });

        test('should validate production environment constraints', () => {
            process.env.NODE_ENV = 'production';
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_PASSWORD = 'test_pass';
            process.env.DB_POOL_MIN = '0';

            expect(() => loadDatabaseConfig())
                .toThrow(/DB_POOL_MIN should be at least 1 in production for availability/);
        });
    });

    describe('getPoolConfig Function', () => {
        test('should return comprehensive pool configuration', () => {
            const mockConfig: DatabaseConfig = {
                host: 'localhost',
                port: 5432,
                database: 'test_db',
                username: 'test_user',
                password: 'test_pass',
                ssl: { mode: 'disable' },
                pool: {
                    min: 3,
                    max: 15,
                    idleTimeoutMillis: 12000,
                    connectionTimeoutMillis: 6000,
                    statementTimeoutMillis: 35000,
                    acquireTimeoutMillis: 90000,
                    createTimeoutMillis: 40000,
                    destroyTimeoutMillis: 8000,
                    reapIntervalMillis: 1500,
                    validateOnBorrow: true,
                    testOnCreate: false,
                    maxWaitingClients: 25,
                    allowExitOnIdle: false,
                    maxUses: 8000,
                    maxLifetimeSeconds: 2400,
                    application_name: 'test_app',
                    keepAlive: true,
                    keepAliveInitialDelayMillis: 500,
                },
                environment: 'development',
                migration: { table: 'migrations', schema: 'public' },
                health: { checkInterval: 30000, retryAttempts: 3, retryDelay: 1000, retryBackoff: 'exponential' },
            };

            const poolConfig = getPoolConfig(mockConfig);

            expect(poolConfig.min).toBe(3);
            expect(poolConfig.max).toBe(15);
            expect(poolConfig.idleTimeoutMillis).toBe(12000);
            expect(poolConfig.connectionTimeoutMillis).toBe(6000);
            expect(poolConfig.statement_timeout).toBe(35000);
            expect(poolConfig.acquireTimeoutMillis).toBe(90000);
            expect(poolConfig.createTimeoutMillis).toBe(40000);
            expect(poolConfig.destroyTimeoutMillis).toBe(8000);
            expect(poolConfig.reapIntervalMillis).toBe(1500);
            expect(poolConfig.validateOnBorrow).toBe(true);
            expect(poolConfig.testOnCreate).toBe(false);
            expect(poolConfig.maxWaitingClients).toBe(25);
            expect(poolConfig.allowExitOnIdle).toBe(false);
            expect(poolConfig.maxUses).toBe(8000);
            expect(poolConfig.maxLifetimeSeconds).toBe(2400);
            expect(poolConfig.application_name).toBe('test_app');
            expect(poolConfig.keepAlive).toBe(true);
            expect(poolConfig.keepAliveInitialDelayMillis).toBe(500);
        });

        test('should handle unlimited values correctly', () => {
            const mockConfig: DatabaseConfig = {
                host: 'localhost',
                port: 5432,
                database: 'test_db',
                username: 'test_user',
                password: 'test_pass',
                ssl: { mode: 'disable' },
                pool: {
                    min: 1,
                    max: 5,
                    idleTimeoutMillis: 10000,
                    connectionTimeoutMillis: 5000,
                    statementTimeoutMillis: 30000,
                    acquireTimeoutMillis: 60000,
                    createTimeoutMillis: 30000,
                    destroyTimeoutMillis: 5000,
                    reapIntervalMillis: 1000,
                    validateOnBorrow: true,
                    testOnCreate: true,
                    maxWaitingClients: 0, // unlimited
                    allowExitOnIdle: false,
                    maxUses: 0, // unlimited
                    maxLifetimeSeconds: 0, // unlimited
                    keepAlive: true,
                    keepAliveInitialDelayMillis: 0,
                },
                environment: 'development',
                migration: { table: 'migrations', schema: 'public' },
                health: { checkInterval: 30000, retryAttempts: 3, retryDelay: 1000, retryBackoff: 'exponential' },
            };

            const poolConfig = getPoolConfig(mockConfig);

            expect(poolConfig.maxWaitingClients).toBeUndefined();
            expect(poolConfig.maxUses).toBeUndefined();
            expect(poolConfig.maxLifetimeSeconds).toBeUndefined();
        });

        test('should set default application name when not provided', () => {
            const mockConfig: DatabaseConfig = {
                host: 'localhost',
                port: 5432,
                database: 'test_db',
                username: 'test_user',
                password: 'test_pass',
                ssl: { mode: 'disable' },
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
                environment: 'production',
                migration: { table: 'migrations', schema: 'public' },
                health: { checkInterval: 30000, retryAttempts: 3, retryDelay: 1000, retryBackoff: 'exponential' },
            };

            const poolConfig = getPoolConfig(mockConfig);

            expect(poolConfig.application_name).toBe('qa_copilot_production');
        });
    });

    describe('Environment-Specific Configuration', () => {
        test('should provide development environment defaults', () => {
            const envConfig = getEnvironmentConfig('development');

            expect(envConfig.pool?.min).toBe(2);
            expect(envConfig.pool?.max).toBe(10);
            expect(envConfig.pool?.allowExitOnIdle).toBe(false);
            expect(envConfig.pool?.keepAlive).toBe(true);
            expect(envConfig.pool?.maxLifetimeSeconds).toBe(1800);
        });

        test('should provide test environment defaults', () => {
            const envConfig = getEnvironmentConfig('test');

            expect(envConfig.pool?.min).toBe(1);
            expect(envConfig.pool?.max).toBe(5);
            expect(envConfig.pool?.allowExitOnIdle).toBe(true);
            expect(envConfig.pool?.keepAlive).toBe(false);
            expect(envConfig.pool?.maxLifetimeSeconds).toBe(300);
        });

        test('should provide production environment defaults', () => {
            const envConfig = getEnvironmentConfig('production');

            expect(envConfig.pool?.min).toBe(5);
            expect(envConfig.pool?.max).toBe(20);
            expect(envConfig.pool?.allowExitOnIdle).toBe(false);
            expect(envConfig.pool?.keepAlive).toBe(true);
            expect(envConfig.pool?.maxWaitingClients).toBe(100);
            expect(envConfig.pool?.maxLifetimeSeconds).toBe(3600);
        });

        test('should have appropriate timeout settings for each environment', () => {
            const devConfig = getEnvironmentConfig('development');
            const testConfig = getEnvironmentConfig('test');
            const prodConfig = getEnvironmentConfig('production');

            // Test environment should have shorter timeouts
            expect(testConfig.pool?.connectionTimeoutMillis).toBeLessThan(devConfig.pool?.connectionTimeoutMillis!);
            expect(testConfig.pool?.statementTimeoutMillis).toBeLessThan(devConfig.pool?.statementTimeoutMillis!);

            // Production should have longer timeouts for stability
            expect(prodConfig.pool?.connectionTimeoutMillis).toBeGreaterThan(devConfig.pool?.connectionTimeoutMillis!);
            expect(prodConfig.pool?.statementTimeoutMillis).toBeGreaterThan(devConfig.pool?.statementTimeoutMillis!);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('should handle string boolean conversion for pool settings', () => {
            process.env.NODE_ENV = 'development';
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_PASSWORD = 'test_pass';
            process.env.DB_POOL_VALIDATE_ON_BORROW = '';   // empty string is falsy
            process.env.DB_POOL_TEST_ON_CREATE = 'true';   // string 'true' is truthy
            process.env.DB_POOL_ALLOW_EXIT_ON_IDLE = '1';  // string '1' is truthy
            process.env.DB_POOL_KEEP_ALIVE = '';           // empty string is falsy

            const config = loadDatabaseConfig();

            expect(config.pool.validateOnBorrow).toBe(false);
            expect(config.pool.testOnCreate).toBe(true);
            expect(config.pool.allowExitOnIdle).toBe(true);
            expect(config.pool.keepAlive).toBe(false);
        });

        test('should handle invalid numeric values gracefully', () => {
            process.env.NODE_ENV = 'development';
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_PASSWORD = 'test_pass';
            process.env.DB_POOL_MIN = 'invalid';

            expect(() => loadDatabaseConfig()).toThrow();
        });

        test('should reject negative values for timeouts', () => {
            process.env.NODE_ENV = 'development';
            process.env.DB_NAME = 'test_db';
            process.env.DB_USER = 'test_user';
            process.env.DB_PASSWORD = 'test_pass';
            process.env.DB_POOL_ACQUIRE_TIMEOUT = '-1000';

            expect(() => loadDatabaseConfig()).toThrow();
        });
    });
});