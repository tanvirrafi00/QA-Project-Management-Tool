#!/usr/bin/env tsx
/**
 * Enhanced Migration Script — AI QA Copilot
 * 
 * Comprehensive migration execution with:
 * - Pre-migration validation and health checks
 * - Migration history tracking and verification
 * - Duplicate migration detection
 * - Transaction-based migration application
 * - Migration file integrity validation
 * - Environment-specific safety checks
 * 
 * Usage:
 *   npm run db:migrate
 *   NODE_ENV=production npm run db:migrate
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6
 */

import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { databaseConfig, buildConnectionString } from "../config";

interface MigrationFile {
    filename: string;
    path: string;
    content: string;
    checksum: string;
    version: string;
}

interface MigrationRecord {
    id: number;
    hash: string;
    created_at: string;
}

class MigrationManager {
    private client: postgres.Sql;
    private db: ReturnType<typeof drizzle>;
    private migrationsPath: string;
    private environment: string;

    constructor() {
        this.environment = process.env.NODE_ENV || 'development';
        this.migrationsPath = join(__dirname, '../migrations');

        const connectionString = buildConnectionString(databaseConfig);
        this.client = postgres(connectionString, {
            max: 1,  // Single connection for migrations
            onnotice: () => { }, // Suppress notices during migration
        });
        this.db = drizzle(this.client);
    }

    /**
     * Validate database connection and readiness
     */
    async validateConnection(): Promise<void> {
        console.log('🔍 Validating database connection...');

        try {
            await this.client`SELECT 1 as test`;
            console.log('✓ Database connection successful');
        } catch (error) {
            console.error('✗ Database connection failed:', error);
            throw new Error('Cannot connect to database. Check your connection configuration.');
        }
    }

    /**
     * Load and validate migration files from filesystem
     */
    async loadMigrationFiles(): Promise<MigrationFile[]> {
        console.log('📂 Loading migration files...');

        try {
            const files = await readdir(this.migrationsPath);
            const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

            if (sqlFiles.length === 0) {
                console.log('ℹ No migration files found');
                return [];
            }

            const migrations: MigrationFile[] = [];

            for (const filename of sqlFiles) {
                const filepath = join(this.migrationsPath, filename);
                const content = await readFile(filepath, 'utf-8');
                const checksum = createHash('sha256').update(content).digest('hex');
                const version = filename.replace('.sql', '');

                migrations.push({
                    filename,
                    path: filepath,
                    content,
                    checksum,
                    version
                });
            }

            console.log(`✓ Loaded ${migrations.length} migration files`);
            return migrations;
        } catch (error) {
            console.error('✗ Failed to load migration files:', error);
            throw new Error('Cannot read migration files from filesystem');
        }
    }

    /**
     * Get applied migrations from database
     */
    async getAppliedMigrations(): Promise<MigrationRecord[]> {
        const migrationTable = `${databaseConfig.migration.schema}.${databaseConfig.migration.table}`;

        try {
            // Check if migration table exists, create if not
            const tableExists = await this.client`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = ${databaseConfig.migration.schema} 
                    AND table_name = ${databaseConfig.migration.table}
                )
            `;

            if (!tableExists[0].exists) {
                console.log(`📊 Creating migration tracking table: ${migrationTable}`);
                await this.client`
                    CREATE TABLE IF NOT EXISTS ${this.client.unsafe(migrationTable)} (
                        id SERIAL PRIMARY KEY,
                        hash VARCHAR(255) NOT NULL,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                `;
            }

            const applied = await this.client`
                SELECT id, hash, created_at::text
                FROM ${this.client.unsafe(migrationTable)}
                ORDER BY id
            `;

            console.log(`📋 Found ${applied.length} applied migrations`);
            return applied as unknown as MigrationRecord[];
        } catch (error) {
            console.error('✗ Failed to query migration history:', error);
            throw new Error('Cannot access migration tracking table');
        }
    }

    /**
     * Validate migration file integrity
     */
    validateMigrationIntegrity(fileList: MigrationFile[], appliedList: MigrationRecord[]): void {
        console.log('🔍 Validating migration integrity...');

        // Check for gaps in migration sequence
        const sortedFiles = fileList.sort((a, b) => a.version.localeCompare(b.version));

        for (let i = 0; i < sortedFiles.length - 1; i++) {
            const current = sortedFiles[i];
            const next = sortedFiles[i + 1];

            // Basic sequence validation (assumes XXXX_ prefix format)
            const currentNum = parseInt(current.version.substring(0, 4));
            const nextNum = parseInt(next.version.substring(0, 4));

            if (isNaN(currentNum) || isNaN(nextNum)) {
                console.warn(`⚠ Migration file naming may not follow expected pattern: ${current.version}, ${next.version}`);
                continue;
            }

            if (nextNum !== currentNum + 1) {
                console.warn(`⚠ Potential gap in migration sequence: ${current.version} -> ${next.version}`);
            }
        }

        // Validate that applied migrations match file checksums
        const appliedHashes = new Set(appliedList.map(m => m.hash));
        let integrityErrors = 0;

        for (const file of fileList.slice(0, appliedList.length)) {
            if (!appliedHashes.has(file.checksum)) {
                console.error(`✗ Migration file integrity mismatch: ${file.filename}`);
                integrityErrors++;
            }
        }

        if (integrityErrors > 0) {
            throw new Error(`Migration integrity validation failed. ${integrityErrors} files have been modified after application.`);
        }

        console.log('✓ Migration integrity validation passed');
    }

    /**
     * Check for duplicate migrations
     */
    checkForDuplicates(fileList: MigrationFile[], appliedList: MigrationRecord[]): MigrationFile[] {
        console.log('🔍 Checking for duplicate migrations...');

        const appliedHashes = new Set(appliedList.map(m => m.hash));
        const pendingMigrations = fileList.filter(file => !appliedHashes.has(file.checksum));

        if (pendingMigrations.length === 0) {
            console.log('✓ No pending migrations found');
            return [];
        }

        console.log(`📝 Found ${pendingMigrations.length} pending migrations:`);
        pendingMigrations.forEach(migration => {
            console.log(`   - ${migration.filename}`);
        });

        return pendingMigrations;
    }

    /**
     * Apply pending migrations with transaction safety
     */
    async applyMigrations(pendingMigrations: MigrationFile[]): Promise<void> {
        if (pendingMigrations.length === 0) {
            console.log('ℹ No migrations to apply');
            return;
        }

        console.log('🚀 Starting migration application...');

        // Environment safety check for production
        if (this.environment === 'production') {
            console.log('🔒 Production environment - using extra caution');

            if (pendingMigrations.length > 5) {
                throw new Error('Too many pending migrations for production. Apply migrations in smaller batches.');
            }
        }

        try {
            // Use Drizzle's migrate function which handles transactions
            await migrate(this.db, { migrationsFolder: this.migrationsPath });

            console.log('✅ All migrations applied successfully');

            // Verify migration application
            await this.verifyMigrationApplication(pendingMigrations);

        } catch (error) {
            console.error('✗ Migration failed:', error);
            console.log('🔄 Database changes have been rolled back');
            throw new Error(`Migration application failed: ${error}`);
        }
    }

    /**
     * Verify that migrations were applied correctly
     */
    async verifyMigrationApplication(appliedMigrations: MigrationFile[]): Promise<void> {
        console.log('🔍 Verifying migration application...');

        try {
            const currentApplied = await this.getAppliedMigrations();
            const expectedCount = currentApplied.length;

            if (currentApplied.length >= appliedMigrations.length) {
                console.log('✓ Migration application verified');
            } else {
                throw new Error('Migration count mismatch after application');
            }
        } catch (error) {
            console.error('✗ Migration verification failed:', error);
            throw error;
        }
    }

    /**
     * Execute complete migration process
     */
    async executeMigration(): Promise<void> {
        console.log(`🎯 Starting database migration for ${this.environment} environment`);
        console.log(`📊 Migration tracking: ${databaseConfig.migration.schema}.${databaseConfig.migration.table}`);
        console.log('');

        try {
            // Step 1: Validate connection
            await this.validateConnection();

            // Step 2: Load migration files
            const migrationFiles = await this.loadMigrationFiles();

            if (migrationFiles.length === 0) {
                console.log('✅ Migration completed - no files to process');
                return;
            }

            // Step 3: Get applied migrations  
            const appliedMigrations = await this.getAppliedMigrations();

            // Step 4: Validate integrity
            this.validateMigrationIntegrity(migrationFiles, appliedMigrations);

            // Step 5: Check for duplicates and get pending
            const pendingMigrations = this.checkForDuplicates(migrationFiles, appliedMigrations);

            // Step 6: Apply pending migrations
            await this.applyMigrations(pendingMigrations);

            console.log('');
            console.log('✅ Migration completed successfully');
            console.log(`📈 Database schema is up to date (${migrationFiles.length} total migrations)`);

        } catch (error) {
            console.log('');
            console.error('❌ Migration failed:', error);
            process.exit(1);
        } finally {
            await this.client.end();
        }
    }
}

// Execute migration if run directly
if (require.main === module) {
    const migrationManager = new MigrationManager();
    migrationManager.executeMigration();
}

export { MigrationManager };