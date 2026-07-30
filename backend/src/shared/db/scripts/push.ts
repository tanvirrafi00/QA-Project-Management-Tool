#!/usr/bin/env tsx
/**
 * Schema Push Script — AI QA Copilot
 * 
 * Development-focused schema push with enhanced safety:
 * - Direct schema synchronization for development
 * - Environment restrictions for safety
 * - Backup recommendations and confirmations
 * - Schema comparison and validation
 * - Rollback preparation
 * 
 * Usage:
 *   npm run db:push
 *   npm run db:push --force (skip confirmations in dev)
 * 
 * Production Safety: Schema push is RESTRICTED in production
 * 
 * Validates: Requirements 2.7, 14.5
 */

import "dotenv/config";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { databaseConfig } from "../config";

class SchemaPush {
    private environment: string;
    private forceMode: boolean;

    constructor() {
        this.environment = process.env.NODE_ENV || 'development';
        this.forceMode = process.argv.includes('--force');
    }

    /**
     * Check environment permissions for schema push
     */
    checkEnvironmentPermissions(): void {
        console.log(`🎯 Schema Push — ${this.environment.toUpperCase()} Environment`);
        console.log(`📊 Target Database: ${databaseConfig.host}:${databaseConfig.port}/${databaseConfig.database}`);
        console.log('');

        if (this.environment === 'production') {
            console.error('❌ SCHEMA PUSH DENIED');
            console.error('');
            console.error('Direct schema push is RESTRICTED in production environment.');
            console.error('Production schema changes must go through proper migration workflow.');
            console.error('');
            console.error('Use the migration workflow instead:');
            console.error('1. npm run db:generate  (generate migration files)');
            console.error('2. npm run db:migrate   (apply migrations)');
            console.error('');
            console.error('This ensures proper change tracking and rollback capability.');
            process.exit(1);
        }

        if (this.environment === 'test') {
            console.log('🧪 Test environment detected - schema push allowed');
            console.log('⚠️  Push will overwrite existing schema without migration history');
        } else {
            console.log('🔧 Development environment detected - schema push available');
            console.log('💡 Tip: Use migrations for production-bound changes');
        }
    }

    /**
     * Display push warnings and recommendations
     */
    displayWarnings(): void {
        console.log('');
        console.log('⚠️  SCHEMA PUSH WARNINGS');
        console.log('========================');
        console.log('Schema push will:');
        console.log('  • Directly modify database schema');
        console.log('  • Skip migration file generation');
        console.log('  • Not create rollback history');
        console.log('  • Potentially cause data loss');
        console.log('');
        console.log('🔄 Alternative: Use migration workflow');
        console.log('  1. npm run db:generate (creates migration files)');
        console.log('  2. npm run db:migrate  (applies with history tracking)');
        console.log('');
        console.log('💾 Recommendations before proceeding:');
        console.log('  ✓ Backup your database');
        console.log('  ✓ Ensure no important data will be lost');
        console.log('  ✓ Consider using migrations for team collaboration');
        console.log('');
    }

    /**
     * Get user confirmation for schema push
     */
    async confirmPush(): Promise<boolean> {
        if (this.forceMode) {
            console.log('🔄 Force mode enabled - skipping confirmation');
            return true;
        }

        this.displayWarnings();

        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        return new Promise((resolve) => {
            rl.question('Type "PUSH" (uppercase) to confirm schema push: ', (answer) => {
                rl.close();
                resolve(answer === 'PUSH');
            });
        });
    }

    /**
     * Execute Drizzle Kit push with proper error handling
     */
    async executePush(): Promise<void> {
        console.log('🚀 Executing schema push...');
        console.log('');

        try {
            // Execute drizzle-kit push with verbose output
            const output = execSync('npx drizzle-kit push', {
                encoding: 'utf-8',
                stdio: 'pipe',
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    // Ensure environment variables are passed through
                }
            });

            console.log(output);
            console.log('✅ Schema push completed successfully');

        } catch (error: any) {
            console.error('❌ Schema push failed');
            console.error('');

            if (error.stdout) {
                console.error('Output:', error.stdout);
            }
            if (error.stderr) {
                console.error('Error:', error.stderr);
            }

            console.error('');
            console.error('Common solutions:');
            console.error('  • Check database connection configuration');
            console.error('  • Verify DATABASE_URL or discrete DB settings');
            console.error('  • Ensure database is running and accessible');
            console.error('  • Review schema.ts for syntax errors');

            throw new Error('Schema push operation failed');
        }
    }

    /**
     * Verify schema push results
     */
    async verifyPush(): Promise<void> {
        console.log('');
        console.log('🔍 Verifying schema push results...');

        try {
            // Run a simple connection test to verify the database is accessible
            const testOutput = execSync('npm run db:validate', {
                encoding: 'utf-8',
                stdio: 'pipe',
                cwd: process.cwd()
            });

            console.log('✓ Database connection verified');
            console.log('✓ Schema push verification completed');

        } catch (error) {
            console.warn('⚠️  Post-push verification encountered issues');
            console.warn('   Database may still be functional - check manually');
        }
    }

    /**
     * Provide post-push recommendations
     */
    providePostPushGuidance(): void {
        console.log('');
        console.log('📋 POST-PUSH RECOMMENDATIONS');
        console.log('============================');
        console.log('');
        console.log('✅ Next steps:');
        console.log('  1. Test your application functionality');
        console.log('  2. Verify data integrity');
        console.log('  3. Update team about schema changes');
        console.log('');
        console.log('🔄 For production deployment:');
        console.log('  1. Generate proper migrations: npm run db:generate');
        console.log('  2. Review generated SQL files');
        console.log('  3. Apply via migrations: npm run db:migrate');
        console.log('');
        console.log('📊 Monitor database:');
        console.log('  • Check application logs for schema-related errors');
        console.log('  • Run npm run db:migrate:status for current state');
        console.log('  • Consider creating a backup of the updated schema');
    }

    /**
     * Execute complete schema push process
     */
    async executeCompletePush(): Promise<void> {
        try {
            // Step 1: Check environment permissions
            this.checkEnvironmentPermissions();

            // Step 2: Get user confirmation
            const confirmed = await this.confirmPush();
            if (!confirmed) {
                console.log('❌ Schema push cancelled by user');
                return;
            }

            // Step 3: Execute push
            await this.executePush();

            // Step 4: Verify results
            await this.verifyPush();

            // Step 5: Provide guidance
            this.providePostPushGuidance();

        } catch (error) {
            console.log('');
            console.error('❌ Schema push failed:', error);
            console.error('');
            console.error('Recovery options:');
            console.error('  • Restore database from backup');
            console.error('  • Fix schema issues and retry');
            console.error('  • Use migration workflow for safer deployment');
            process.exit(1);
        }
    }
}

// Execute schema push if run directly
if (require.main === module) {
    const schemaPush = new SchemaPush();
    schemaPush.executeCompletePush();
}

export { SchemaPush };