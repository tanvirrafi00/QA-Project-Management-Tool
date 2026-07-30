/**
 * Database Configuration Validation Script
 * 
 * Validates database configuration and tests connection capabilities.
 * Can be used during startup or as a standalone validation tool.
 * 
 * Usage: tsx src/shared/db/validate-config.ts
 */

import "dotenv/config";
import { databaseConfig, isDatabaseConfigured, buildConnectionString } from './config';
import { validateConnection, getPoolStats } from './client';
import logger from '../logger';

async function validateDatabaseConfiguration() {
    console.log('🔍 Validating database configuration...\n');

    // Check if database is configured
    if (!isDatabaseConfigured()) {
        console.error('❌ Database is not properly configured');
        console.log('   Please check your environment variables and ensure either:');
        console.log('   1. DATABASE_URL is set, or');
        console.log('   2. DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME are set');
        return false;
    }

    console.log('✅ Database configuration loaded successfully');

    // Display configuration summary
    console.log('\n📋 Configuration Summary:');
    console.log(`   Environment: ${databaseConfig.environment}`);
    console.log(`   Database: ${databaseConfig.database}`);
    console.log(`   Host: ${databaseConfig.host}:${databaseConfig.port}`);
    console.log(`   SSL Mode: ${databaseConfig.ssl.mode}`);
    console.log(`   Pool: ${databaseConfig.pool.min}-${databaseConfig.pool.max} connections`);
    console.log(`   Connection timeout: ${databaseConfig.pool.connectionTimeoutMillis}ms`);
    console.log(`   Statement timeout: ${databaseConfig.pool.statementTimeoutMillis}ms`);

    // Test connection string building
    try {
        const connectionString = buildConnectionString(databaseConfig);
        console.log('\n✅ Connection string built successfully');
        // Don't log the actual connection string as it may contain credentials
        console.log('   (Connection string contains credentials - not displayed)');
    } catch (error) {
        console.error('❌ Failed to build connection string:', error instanceof Error ? error.message : String(error));
        return false;
    }

    // Test database connection
    console.log('\n🔄 Testing database connection...');
    try {
        await validateConnection();
        console.log('✅ Database connection test successful');
    } catch (error) {
        console.error('❌ Database connection test failed:', error instanceof Error ? error.message : String(error));
        console.log('   This may be expected if PostgreSQL is not running or not configured');
        return false;
    }

    // Show pool statistics
    const poolStats = getPoolStats();
    if (poolStats) {
        console.log('\n📊 Connection Pool Statistics:');
        console.log(`   Total connections: ${poolStats.totalCount}`);
        console.log(`   Idle connections: ${poolStats.idleCount}`);
        console.log(`   Waiting connections: ${poolStats.waitingCount}`);
    }

    console.log('\n🎉 Database configuration validation completed successfully!');
    return true;
}

// Run validation if this file is executed directly
if (require.main === module) {
    validateDatabaseConfiguration()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            logger.error('Validation script failed:', error);
            process.exit(1);
        });
}

export { validateDatabaseConfiguration };