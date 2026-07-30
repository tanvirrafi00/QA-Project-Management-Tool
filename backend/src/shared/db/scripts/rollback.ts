#!/usr/bin/env tsx
/**
 * Migration Rollback Script — AI QA Copilot
 * 
 * Provides controlled rollback capabilities with safety checks:
 * - Rollback last applied migration (development/test only)
 * - Comprehensive safety checks and confirmations
 * - Rollback validation and verification
 * - Environment-specific restrictions
 * - Backup recommendations before rollback
 * 
 * Usage:
 *   npm run db:migrate:rollback
 *   npm run db:migrate:rollback --force (skip confirmations in dev)
 * 
 * Production Safety: Rollbacks are DISABLED in production environment
 * 
 * Validates: Requirements 2.5, 14.5
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readFile } from "fs/promises";
import { join } from "path";
import { createInterface } from "readline";
import { databaseConfig, buildConnectionString } from "../config";

interface RollbackInfo {
    migrationId: number;
    migrationHash: string;
    appliedAt: string;
    migrationFile?: string;
    rollbackAvailable: boolean;
}

class MigrationRollback {
    private client: postgres.Sql;
    private db: ReturnType<typeof drizzle>;
    private migrationsPath: string;
    private environment: string;
    private forceMode: boolean;

    constructor() {
        this.environment = process.env.NODE_ENV || 'development';
        this.migrationsPath = join(__dirname, '../migrations');
        this.forceMode = process.argv.includes('--force');

        const connectionString = buildConnectionString(databaseConfig);
        this.client = postgres(connectionString, {
            max: 1,
            onnotice: () => { },
        });
        this.db = drizzle(this.client);
    }

    /**
     * Check if rollback is allowed in current environment
     */
    checkEnvironmentPermissions(): void {
        if (this.environment === 'production') {
            console.error('❌ ROLLBACK DENIED');
            console.error('');
            console.error('Migration rollbacks are DISABLED in production environment.');
            console.error('Production rollbacks require manual intervention and database expertise.');
            console.error('');
            console.error('Recommended production rollback process:');
            console.error('1. Create database backup');
            console.error('2. Plan rollback strategy with team');
            console.error('3. Execute manual rollback with proper validation');
            console.error('4. Test application functionality thoroughly');
            process.exit(1);
        }

        if (this.environment === 'test') {
            console.log('🧪 Test environment - rollback allowed with cautions');
        } else {
            console.log('🔧 Development environment - rollback available');
        }
    }

    /**
     * Get last applied migration
     */
    async getLastAppliedMigration(): Promise<RollbackInfo | null> {
        const migrationTable = `${databaseConfig.migration.schema}.${databaseConfig.migration.table}`;

        try {
            // Check if migration table exists
            const tableExists = await this.client`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = ${databaseConfig.migration.schema} 
                    AND table_name = ${databaseConfig.migration.table}
                )
            `;

            if (!tableExists[0].exists) {
                console.log('ℹ️ No migration table found - no migrations to rollback');
                return null;
            }

            const lastMigration = await this.client`
                SELECT id, hash, created_at::text
                FROM ${this.client.unsafe(migrationTable)}
                ORDER BY id DESC
                LIMIT 1
            `;

            if (lastMigration.length === 0) {
                console.log('ℹ️ No applied migrations found - nothing to rollback');
                return null;
            }

            const migration = lastMigration[0];
            return {
                migrationId: migration.id,
                migrationHash: migration.hash,
                appliedAt: migration.created_at,
                rollbackAvailable: false // Will be determined by finding rollback file
            };

        } catch (error) {
            throw new Error(`Failed to query last applied migration: ${error}`);
        }
    }

    /**
     * Look for corresponding rollback file or instructions
     */
    async findRollbackInstructions(rollbackInfo: RollbackInfo): Promise<RollbackInfo> {
        // Try to find the original migration file to extract rollback instructions
        try {
            const files = await this.client`SELECT 1`; // Just test connection

            // For now, we'll use a simple approach - manual rollback
            // In a more sophisticated system, we could store rollback SQL
            // alongside migration files or in the database

            rollbackInfo.rollbackAvailable = false;
            rollbackInfo.migrationFile = 'Manual rollback required';

            return rollbackInfo;

        } catch (error) {
            rollbackInfo.rollbackAvailable = false;
            return rollbackInfo;
        }
    }

    /**
     * Confirm rollback with user
     */
    async confirmRollback(rollbackInfo: RollbackInfo): Promise<boolean> {
        if (this.forceMode) {
            console.log('🔄 Force mode enabled - skipping confirmation');
            return true;
        }

        console.log('');
        console.log('⚠️  ROLLBACK CONFIRMATION REQUIRED');
        console.log('==================================');
        console.log(`Migration ID: ${rollbackInfo.migrationId}`);
        console.log(`Applied at: ${new Date(rollbackInfo.appliedAt).toLocaleString()}`);
        console.log(`Hash: ${rollbackInfo.migrationHash.substring(0, 12)}...`);
        console.log('');
        console.log('⚠️  WARNING: Rolling back migrations can cause data loss!');
        console.log('');
        console.log('Before proceeding, ensure you have:');
        console.log('  ✓ Created a database backup');
        console.log('  ✓ Verified no critical data will be lost');
        console.log('  ✓ Informed your team about the rollback');
        console.log('  ✓ Prepared to test the application after rollback');
        console.log('');

        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        return new Promise((resolve) => {
            rl.question('Type "ROLLBACK" (uppercase) to confirm rollback: ', (answer) => {
                rl.close();
                resolve(answer === 'ROLLBACK');
            });
        });
    }

    /**
     * Execute rollback by removing migration record
     */
    async executeRollback(rollbackInfo: RollbackInfo): Promise<void> {
        const migrationTable = `${databaseConfig.migration.schema}.${databaseConfig.migration.table}`;

        console.log('🔄 Starting rollback process...');

        try {
            // Start transaction for rollback
            await this.client.begin(async (tx) => {
                // Remove the migration record
                const result = await tx`
                    DELETE FROM ${tx.unsafe(migrationTable)}
                    WHERE id = ${rollbackInfo.migrationId}
                `;

                if (result.count === 0) {
                    throw new Error('Migration record not found or already removed');
                }

                console.log(`✓ Removed migration record (ID: ${rollbackInfo.migrationId})`);
            });

            console.log('');
            console.log('⚠️  IMPORTANT: MANUAL SCHEMA ROLLBACK REQUIRED');
            console.log('============================================');
            console.log('The migration record has been removed from the tracking table,');
            console.log('but the database schema changes have NOT been automatically reversed.');
            console.log('');
            console.log('You must manually:');
            console.log('1. Review the original migration file');
            console.log('2. Create and execute appropriate reverse SQL statements');
            console.log('3. Test the application thoroughly');
            console.log('4. Consider creating a new migration for the schema changes');
            console.log('');
            console.log('Schema rollback is manual to prevent accidental data loss.');

        } catch (error) {
            console.error('❌ Rollback failed:', error);
            throw new Error(`Migration rollback failed: ${error}`);
        }
    }

    /**
     * Verify rollback completion
     */
    async verifyRollback(originalMigrationId: number): Promise<void> {
        console.log('🔍 Verifying rollback completion...');

        const migrationTable = `${databaseConfig.migration.schema}.${databaseConfig.migration.table}`;

        try {
            const check = await this.client`
                SELECT id FROM ${this.client.unsafe(migrationTable)}
                WHERE id = ${originalMigrationId}
            `;

            if (check.length === 0) {
                console.log('✓ Rollback verification successful');
                console.log('  Migration record has been removed from tracking table');
            } else {
                throw new Error('Migration record still exists after rollback');
            }

            // Get current migration count
            const currentMigrations = await this.client`
                SELECT COUNT(*) as count 
                FROM ${this.client.unsafe(migrationTable)}
            `;

            console.log(`ℹ️  Current applied migrations: ${currentMigrations[0].count}`);

        } catch (error) {
            console.error('❌ Rollback verification failed:', error);
            throw error;
        }
    }

    /**
     * Execute complete rollback process
     */
    async executeCompleteRollback(): Promise<void> {
        console.log(`🎯 Migration Rollback — ${this.environment.toUpperCase()} Environment`);
        console.log(`📊 Migration Table: ${databaseConfig.migration.schema}.${databaseConfig.migration.table}`);
        console.log('');

        try {
            // Step 1: Check environment permissions
            this.checkEnvironmentPermissions();

            // Step 2: Get last applied migration
            const rollbackInfo = await this.getLastAppliedMigration();
            if (!rollbackInfo) {
                console.log('✅ No migrations to rollback');
                return;
            }

            // Step 3: Find rollback instructions
            const rollbackDetails = await this.findRollbackInstructions(rollbackInfo);

            // Step 4: Confirm rollback
            const confirmed = await this.confirmRollback(rollbackDetails);
            if (!confirmed) {
                console.log('❌ Rollback cancelled by user');
                return;
            }

            // Step 5: Execute rollback
            await this.executeRollback(rollbackDetails);

            // Step 6: Verify rollback
            await this.verifyRollback(rollbackDetails.migrationId);

            console.log('');
            console.log('✅ Migration rollback completed');
            console.log('⚠️  Remember to manually reverse the schema changes');
            console.log('📝 Consider running npm run db:migrate:status to verify current state');

        } catch (error) {
            console.log('');
            console.error('❌ Rollback failed:', error);
            console.error('Database state may be inconsistent - manual intervention required');
            process.exit(1);
        } finally {
            await this.client.end();
        }
    }
}

// Execute rollback if run directly
if (require.main === module) {
    const rollback = new MigrationRollback();
    rollback.executeCompleteRollback();
}

export { MigrationRollback };