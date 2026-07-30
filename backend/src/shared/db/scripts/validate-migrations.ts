#!/usr/bin/env tsx
/**
 * Migration Validation Script — AI QA Copilot
 * 
 * Validates migration file integrity without applying them:
 * - Checks migration file syntax and structure
 * - Validates migration sequence integrity  
 * - Verifies applied migration checksums
 * - Detects potential migration conflicts
 * - Reports migration status and pending changes
 * 
 * Usage:
 *   npm run db:migrate:validate
 * 
 * Validates: Requirements 2.4, 2.6
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { databaseConfig, buildConnectionString } from "../config";

interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    info: string[];
    migrationCount: number;
    appliedCount: number;
    pendingCount: number;
}

class MigrationValidator {
    private client: postgres.Sql;
    private db: ReturnType<typeof drizzle>;
    private migrationsPath: string;
    private environment: string;

    constructor() {
        this.environment = process.env.NODE_ENV || 'development';
        this.migrationsPath = join(__dirname, '../migrations');

        const connectionString = buildConnectionString(databaseConfig);
        this.client = postgres(connectionString, {
            max: 1,
            onnotice: () => { },
        });
        this.db = drizzle(this.client);
    }

    /**
     * Validate database connection
     */
    async validateConnection(): Promise<{ isValid: boolean; error?: string }> {
        try {
            await this.client`SELECT 1 as test`;
            return { isValid: true };
        } catch (error) {
            return { isValid: false, error: `Connection failed: ${error}` };
        }
    }

    /**
     * Load and validate migration files
     */
    async loadMigrationFiles(): Promise<{ files: any[]; errors: string[]; warnings: string[] }> {
        const errors: string[] = [];
        const warnings: string[] = [];
        const files: any[] = [];

        try {
            const fileList = await readdir(this.migrationsPath);
            const sqlFiles = fileList.filter(f => f.endsWith('.sql')).sort();

            if (sqlFiles.length === 0) {
                warnings.push('No migration files found in migrations directory');
                return { files, errors, warnings };
            }

            for (const filename of sqlFiles) {
                try {
                    const filepath = join(this.migrationsPath, filename);
                    const content = await readFile(filepath, 'utf-8');
                    const checksum = createHash('sha256').update(content).digest('hex');
                    const version = filename.replace('.sql', '');

                    // Basic SQL syntax validation
                    if (content.trim().length === 0) {
                        errors.push(`Empty migration file: ${filename}`);
                    }

                    // Check for common SQL syntax issues
                    if (!content.includes('-->') && content.includes('statement-breakpoint')) {
                        warnings.push(`Migration ${filename} may have malformed statement breakpoints`);
                    }

                    // Check migration naming convention
                    if (!/^\d{4}_[a-zA-Z0-9_]+\.sql$/.test(filename)) {
                        warnings.push(`Migration ${filename} doesn't follow naming convention (XXXX_name.sql)`);
                    }

                    files.push({
                        filename,
                        path: filepath,
                        content,
                        checksum,
                        version,
                        size: content.length
                    });

                } catch (fileError) {
                    errors.push(`Failed to read migration file ${filename}: ${fileError}`);
                }
            }

        } catch (dirError) {
            errors.push(`Failed to read migrations directory: ${dirError}`);
        }

        return { files, errors, warnings };
    }

    /**
     * Validate migration sequence and detect gaps
     */
    validateMigrationSequence(files: any[]): { errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (files.length === 0) {
            return { errors, warnings };
        }

        const sortedFiles = files.sort((a, b) => a.version.localeCompare(b.version));

        // Check for sequence gaps
        for (let i = 0; i < sortedFiles.length - 1; i++) {
            const current = sortedFiles[i];
            const next = sortedFiles[i + 1];

            const currentNum = parseInt(current.version.substring(0, 4));
            const nextNum = parseInt(next.version.substring(0, 4));

            if (isNaN(currentNum) || isNaN(nextNum)) {
                warnings.push(`Migration file naming may not follow expected pattern: ${current.version}, ${next.version}`);
                continue;
            }

            if (nextNum !== currentNum + 1) {
                if (nextNum > currentNum + 1) {
                    warnings.push(`Gap in migration sequence: ${current.version} -> ${next.version}`);
                } else {
                    errors.push(`Migration sequence error: ${next.version} should come after ${current.version}`);
                }
            }
        }

        // Check for duplicate version numbers
        const versions = files.map(f => f.version);
        const uniqueVersions = new Set(versions);
        if (versions.length !== uniqueVersions.size) {
            errors.push('Duplicate migration version numbers detected');
        }

        return { errors, warnings };
    }

    /**
     * Get and validate applied migrations
     */
    async getAppliedMigrations(): Promise<{
        migrations: any[];
        errors: string[];
        warnings: string[];
        tableExists: boolean
    }> {
        const errors: string[] = [];
        const warnings: string[] = [];
        const migrations: any[] = [];

        try {
            const migrationTable = `${databaseConfig.migration.schema}.${databaseConfig.migration.table}`;

            // Check if migration table exists
            const tableExists = await this.client`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = ${databaseConfig.migration.schema} 
                    AND table_name = ${databaseConfig.migration.table}
                )
            `;

            if (!tableExists[0].exists) {
                warnings.push(`Migration table ${migrationTable} does not exist - no migrations have been applied`);
                return { migrations, errors, warnings, tableExists: false };
            }

            const applied = await this.client`
                SELECT id, hash, created_at::text
                FROM ${this.client.unsafe(migrationTable)}
                ORDER BY id
            `;

            return {
                migrations: applied,
                errors,
                warnings,
                tableExists: true
            };

        } catch (error) {
            errors.push(`Failed to query applied migrations: ${error}`);
            return { migrations, errors, warnings, tableExists: false };
        }
    }

    /**
     * Validate applied migration integrity
     */
    validateAppliedMigrationIntegrity(files: any[], appliedMigrations: any[]): { errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (appliedMigrations.length === 0) {
            return { errors, warnings };
        }

        // Check that all applied migrations have corresponding files
        const fileChecksums = new Set(files.map(f => f.checksum));
        const appliedHashes = appliedMigrations.map(m => m.hash);

        for (const hash of appliedHashes) {
            if (!fileChecksums.has(hash)) {
                errors.push(`Applied migration with hash ${hash.substring(0, 12)}... has no corresponding file`);
            }
        }

        // Check for modified migration files
        const appliedHashSet = new Set(appliedHashes);
        let modifiedCount = 0;

        for (let i = 0; i < Math.min(files.length, appliedMigrations.length); i++) {
            const file = files[i];
            if (!appliedHashSet.has(file.checksum)) {
                errors.push(`Migration file ${file.filename} has been modified after application`);
                modifiedCount++;
            }
        }

        if (modifiedCount > 0) {
            errors.push(`${modifiedCount} migration files have been modified after application`);
        }

        return { errors, warnings };
    }

    /**
     * Perform comprehensive migration validation
     */
    async validateMigrations(): Promise<ValidationResult> {
        console.log(`🔍 Validating migrations for ${this.environment} environment`);
        console.log(`📊 Migration tracking: ${databaseConfig.migration.schema}.${databaseConfig.migration.table}`);
        console.log('');

        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: [],
            info: [],
            migrationCount: 0,
            appliedCount: 0,
            pendingCount: 0
        };

        try {
            // Step 1: Validate connection
            const connectionResult = await this.validateConnection();
            if (!connectionResult.isValid) {
                result.errors.push(connectionResult.error!);
                result.isValid = false;
                return result;
            }
            result.info.push('✓ Database connection validated');

            // Step 2: Load and validate migration files
            const filesResult = await this.loadMigrationFiles();
            result.errors.push(...filesResult.errors);
            result.warnings.push(...filesResult.warnings);
            result.migrationCount = filesResult.files.length;

            if (filesResult.files.length > 0) {
                result.info.push(`✓ Loaded ${filesResult.files.length} migration files`);
            }

            // Step 3: Validate migration sequence
            const sequenceResult = this.validateMigrationSequence(filesResult.files);
            result.errors.push(...sequenceResult.errors);
            result.warnings.push(...sequenceResult.warnings);

            if (result.errors.length === 0) {
                result.info.push('✓ Migration sequence is valid');
            }

            // Step 4: Get applied migrations
            const appliedResult = await this.getAppliedMigrations();
            result.errors.push(...appliedResult.errors);
            result.warnings.push(...appliedResult.warnings);
            result.appliedCount = appliedResult.migrations.length;

            if (appliedResult.tableExists) {
                result.info.push(`✓ Found ${appliedResult.migrations.length} applied migrations`);
            }

            // Step 5: Validate applied migration integrity
            const integrityResult = this.validateAppliedMigrationIntegrity(filesResult.files, appliedResult.migrations);
            result.errors.push(...integrityResult.errors);
            result.warnings.push(...integrityResult.warnings);

            // Step 6: Calculate pending migrations
            const appliedHashes = new Set(appliedResult.migrations.map(m => m.hash));
            const pendingMigrations = filesResult.files.filter(f => !appliedHashes.has(f.checksum));
            result.pendingCount = pendingMigrations.length;

            if (pendingMigrations.length > 0) {
                result.info.push(`📝 ${pendingMigrations.length} pending migrations found`);
                pendingMigrations.forEach(m => {
                    result.info.push(`   - ${m.filename}`);
                });
            } else {
                result.info.push('✓ No pending migrations - database schema is up to date');
            }

            // Final validation
            if (result.errors.length > 0) {
                result.isValid = false;
            }

        } catch (error) {
            result.errors.push(`Validation failed: ${error}`);
            result.isValid = false;
        } finally {
            await this.client.end();
        }

        return result;
    }

    /**
     * Print validation results
     */
    printResults(result: ValidationResult): void {
        console.log('');
        console.log('📋 MIGRATION VALIDATION RESULTS');
        console.log('================================');
        console.log(`Status: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);
        console.log(`Total migrations: ${result.migrationCount}`);
        console.log(`Applied: ${result.appliedCount}`);
        console.log(`Pending: ${result.pendingCount}`);
        console.log('');

        if (result.info.length > 0) {
            console.log('ℹ️ Information:');
            result.info.forEach(info => console.log(`   ${info}`));
            console.log('');
        }

        if (result.warnings.length > 0) {
            console.log('⚠️ Warnings:');
            result.warnings.forEach(warning => console.log(`   ${warning}`));
            console.log('');
        }

        if (result.errors.length > 0) {
            console.log('❌ Errors:');
            result.errors.forEach(error => console.log(`   ${error}`));
            console.log('');
        }

        if (result.isValid) {
            console.log('✅ Migration validation completed successfully');
            console.log(`   Database is ready for ${result.pendingCount > 0 ? 'migration' : 'use'}`);
        } else {
            console.log('❌ Migration validation failed');
            console.log('   Fix the errors above before running migrations');
        }
    }
}

// Execute validation if run directly
if (require.main === module) {
    (async () => {
        const validator = new MigrationValidator();
        const result = await validator.validateMigrations();
        validator.printResults(result);

        process.exit(result.isValid ? 0 : 1);
    })();
}

export { MigrationValidator };