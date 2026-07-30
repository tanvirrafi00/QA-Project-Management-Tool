/**
 * Connection Pool Configuration Example — AI QA Copilot
 * 
 * This example demonstrates the comprehensive connection pool configuration
 * options added in Task 1.1.2, including timeout settings, validation options,
 * and environment-specific defaults.
 * 
 * Validates: Requirements 15.2, 15.3
 */

import { loadDatabaseConfig, getPoolConfig, getEnvironmentConfig } from '../config';

function demonstratePoolConfiguration() {
    console.log('=== PostgreSQL Connection Pool Configuration Demo ===\n');

    // Example 1: Default configuration for development
    console.log('1. Default Development Configuration:');
    process.env.NODE_ENV = 'development';
    process.env.DB_NAME = 'qa_copilot_dev';
    process.env.DB_USER = 'postgres';
    process.env.DB_PASSWORD = 'postgres';

    const defaultConfig = loadDatabaseConfig();
    console.log('- Pool size:', `${defaultConfig.pool.min}-${defaultConfig.pool.max} connections`);
    console.log('- Connection timeout:', `${defaultConfig.pool.connectionTimeoutMillis}ms`);
    console.log('- Idle timeout:', `${defaultConfig.pool.idleTimeoutMillis}ms`);
    console.log('- Statement timeout:', `${defaultConfig.pool.statementTimeoutMillis}ms`);
    console.log('- Keep alive:', defaultConfig.pool.keepAlive);
    console.log('');

    // Example 2: Custom high-performance configuration
    console.log('2. Custom High-Performance Configuration:');
    process.env.DB_POOL_MIN = '10';
    process.env.DB_POOL_MAX = '50';
    process.env.DB_POOL_CONNECTION_TIMEOUT = '3000';
    process.env.DB_POOL_ACQUIRE_TIMEOUT = '120000';
    process.env.DB_POOL_MAX_WAITING_CLIENTS = '100';
    process.env.DB_POOL_VALIDATE_ON_BORROW = 'true';
    process.env.DB_APPLICATION_NAME = 'qa_copilot_high_perf';

    const customConfig = loadDatabaseConfig();
    console.log('- Pool size:', `${customConfig.pool.min}-${customConfig.pool.max} connections`);
    console.log('- Connection timeout:', `${customConfig.pool.connectionTimeoutMillis}ms`);
    console.log('- Acquire timeout:', `${customConfig.pool.acquireTimeoutMillis}ms`);
    console.log('- Max waiting clients:', customConfig.pool.maxWaitingClients);
    console.log('- Validate on borrow:', customConfig.pool.validateOnBorrow);
    console.log('- Application name:', customConfig.pool.application_name);
    console.log('');

    // Example 3: Environment-specific configurations
    console.log('3. Environment-Specific Pool Configurations:');

    const devEnvConfig = getEnvironmentConfig('development');
    const testEnvConfig = getEnvironmentConfig('test');
    const prodEnvConfig = getEnvironmentConfig('production');

    console.log('Development:',
        `${devEnvConfig.pool?.min}-${devEnvConfig.pool?.max} connections,`,
        `${devEnvConfig.pool?.connectionTimeoutMillis}ms timeout`);
    console.log('Test:',
        `${testEnvConfig.pool?.min}-${testEnvConfig.pool?.max} connections,`,
        `${testEnvConfig.pool?.connectionTimeoutMillis}ms timeout,`,
        'exit on idle:', testEnvConfig.pool?.allowExitOnIdle);
    console.log('Production:',
        `${prodEnvConfig.pool?.min}-${prodEnvConfig.pool?.max} connections,`,
        `${prodEnvConfig.pool?.connectionTimeoutMillis}ms timeout,`,
        'SSL required:', prodEnvConfig.ssl?.mode);
    console.log('');

    // Example 4: Pool configuration for pg.Pool
    console.log('4. Generated pg.Pool Configuration:');
    const poolConfig = getPoolConfig(customConfig);

    console.log('Pool options that will be passed to pg.Pool:');
    console.log(`- connectionString: ${poolConfig.connectionString?.substring(0, 50)}...`);
    console.log(`- min: ${poolConfig.min}`);
    console.log(`- max: ${poolConfig.max}`);
    console.log(`- idleTimeoutMillis: ${poolConfig.idleTimeoutMillis}`);
    console.log(`- connectionTimeoutMillis: ${poolConfig.connectionTimeoutMillis}`);
    console.log(`- acquireTimeoutMillis: ${poolConfig.acquireTimeoutMillis}`);
    console.log(`- maxWaitingClients: ${poolConfig.maxWaitingClients || 'unlimited'}`);
    console.log(`- validateOnBorrow: ${poolConfig.validateOnBorrow}`);
    console.log(`- application_name: ${poolConfig.application_name}`);
    console.log('');

    // Example 5: Advanced lifecycle management options
    console.log('5. Advanced Lifecycle Management:');
    process.env.DB_POOL_MAX_USES = '5000';
    process.env.DB_POOL_MAX_LIFETIME_SECONDS = '3600';
    process.env.DB_POOL_REAP_INTERVAL = '30000';

    const advancedConfig = loadDatabaseConfig();
    console.log('- Max uses per connection:', advancedConfig.pool.maxUses);
    console.log('- Max connection lifetime:', `${advancedConfig.pool.maxLifetimeSeconds}s`);
    console.log('- Pool reap interval:', `${advancedConfig.pool.reapIntervalMillis}ms`);
    console.log('');

    console.log('=== Configuration Complete ===');
    console.log('All these options can be configured via environment variables');
    console.log('See .env.example for complete list of available options.');
}

// Run the demo if this file is executed directly
if (require.main === module) {
    try {
        demonstratePoolConfiguration();
    } catch (error) {
        console.error('Configuration demo failed:', error);
        process.exit(1);
    }
}