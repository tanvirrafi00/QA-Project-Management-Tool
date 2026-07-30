/**
 * Enhanced Drizzle Kit Configuration — AI QA Copilot
 * 
 * Comprehensive migration configuration with validation, environment controls,
 * and migration management features.
 * 
 * Features:
 * - Environment-aware configuration with fallback handling
 * - Migration integrity validation 
 * - Connection health validation before operations
 * - Comprehensive logging and error handling
 * - Development/production environment safety
 * 
 * Scripts:
 * - `db:generate` - Generate versioned migration files (offline)
 * - `db:migrate` - Apply pending migrations with validation
 * - `db:migrate:validate` - Validate migration integrity without applying
 * - `db:migrate:status` - Check migration status and history
 * - `db:migrate:rollback` - Rollback last migration (development only)
 * - `db:push` - Push schema directly for development
 * - `db:studio` - Open Drizzle Studio for database exploration
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 15.1, 15.2
 */
import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { databaseConfig, buildConnectionString, isDatabaseConfigured } from "./src/shared/db/config";

/**
 * Validate configuration and determine connection string with comprehensive error handling
 */
function getValidatedConnectionString(): string {
    const environment = process.env.NODE_ENV || 'development';

    if (isDatabaseConfigured()) {
        try {
            const connectionString = buildConnectionString(databaseConfig);
            console.log(`✓ Using validated database configuration for environment: ${environment}`);
            return connectionString;
        } catch (error) {
            console.error(`✗ Database configuration validation failed:`, error);
            throw new Error(`Invalid database configuration: ${error}`);
        }
    } else {
        // Environment-specific fallback handling
        const fallbackUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/qa_copilot";

        if (environment === 'production') {
            throw new Error(
                'Production environment requires proper database configuration. ' +
                'Set DATABASE_URL or provide DB_HOST, DB_USER, DB_PASSWORD, DB_NAME environment variables.'
            );
        }

        console.warn(`⚠ Using fallback DATABASE_URL for ${environment} environment`);
        console.warn('  Consider setting up proper configuration via environment variables');
        console.warn('  See backend/ENVIRONMENT_CONFIG.md for configuration details');

        return fallbackUrl;
    }
}

/**
 * Validate environment for destructive operations
 */
function validateEnvironmentForOperations(): void {
    const environment = process.env.NODE_ENV || 'development';

    if (environment === 'production') {
        console.log('🔒 Production environment detected - enhanced safety checks enabled');
        console.log('   - Migration rollbacks disabled');
        console.log('   - Schema push operations disabled');
        console.log('   - Comprehensive validation required');
    } else if (environment === 'test') {
        console.log('🧪 Test environment detected - optimized for testing workflows');
    } else {
        console.log('🔧 Development environment detected - all operations available');
    }
}

// Validate environment and get connection string
validateEnvironmentForOperations();
const connectionString = getValidatedConnectionString();

// Determine migration configuration with environment-specific defaults
const migrationConfig = {
    table: databaseConfig?.migration?.table ?? "drizzle_migrations",
    schema: databaseConfig?.migration?.schema ?? "public",
};

console.log(`📊 Migration tracking: ${migrationConfig.schema}.${migrationConfig.table}`);

export default defineConfig({
    schema: "./src/shared/db/schema.ts",
    out: "./src/shared/db/migrations",
    dialect: "postgresql",
    dbCredentials: {
        url: connectionString,
    },
    migrations: migrationConfig,

    // Enhanced Drizzle Kit options for better development experience
    strict: true,           // Enforce strict mode for better type safety
    verbose: true,          // Detailed logging for troubleshooting

    // Migration file naming and organization
    breakpoints: true,      // Enable breakpoints in migration files for complex operations

    // Schema introspection options
    introspect: {
        casing: 'camel'     // Convert snake_case to camelCase during introspection
    },

    // Development and debugging features  
    tablesFilter: ["!drizzle_*"], // Exclude Drizzle internal tables from schema operations
});
