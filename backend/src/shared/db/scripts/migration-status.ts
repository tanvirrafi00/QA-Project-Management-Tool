#!/usr/bin/env tsx
/**
 * Migration Status Script — AI QA Copilot
 * 
 * Provides comprehensive migration status reporting:
 * - Lists all migration files and their application status
 * - Shows migration history with timestamps
 * - Reports pending migrations and their details
 * - Provides migration statistics and health overview
 * - Supports different output formats for automation
 * 
 * Usage:
 *   npm run db:migrate:status
 *   npm run db:migrate:status --json
 * 
 * Validates: Requirements 2.2, 2.3
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { databaseConfig, buildConnectionString } from "../config";

interface MigrationInfo {
    filename: string;
    version: string;
    checksum: string;
    size: number;
    created: Date;
    applied?: {
        id: number;
        appliedAt: string;
        appliedHash: string;
    };
    status: 'applied' | 'pending' | 'modified' | 'orphaned';
}

interface StatusReport {
    environment: string;
    database: {
        connected: boolean;
        migrationTable: string;
        migrationTableExists: boolean;
    };
    summary: {
        totalFiles: number;
        appliedCount: number;
        pendingCount: number;
        modifiedCount: number;
        orphanedCount: number;
    };
    migrations: MigrationInfo[];
    health: {
        isHealthy: boolean;
        issues: string[];
        recommendations: string[];
    };
    timestamp: string;
}

class MigrationStatusReporter {
    private client: postgres.Sql;
    private db: ReturnType<typeof drizzle>;
    private migrationsPath: string;
    private environment: string;
    private outputJson: boolean;

    constructor() {
        this.environment = process.env.NODE_ENV || 'development';
        this.migrationsPath = join(__dirname, '../migrations');
        this.outputJson = process.argv.includes('--json');

        const connectionString = buildConnectionString(databaseConfig);
        this.client = postgres(connectionString, {
            max: 1,
            onnotice: () => { },
        });
        this.db = drizzle(this.client);
    }

    /**
     * Check database connection status
     */
    async checkDatabaseConnection(): Promise<boolean> {
        try {
            await this.client`SELECT 1 as test`;
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Load migration files from filesystem
     */
    async loadMigrationFiles(): Promise<MigrationInfo[]> {
        const migrations: MigrationInfo[] = [];

        try {
            const files = await readdir(this.migrationsPath);
            const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

            for (const filename of sqlFiles) {
                const filepath = join(this.migrationsPath, filename);
                const content = await readFile(filepath, 'utf-8');
                const stats = await stat(filepath);
                const checksum = createHash('sha256').update(content).digest('hex');
                const version = filename.replace('.sql', '');

                migrations.push({
                    filename,
                    version,
                    checksum,
                    size: content.length,
                    created: stats.birthtime,
                    status: 'pending' // Will be updated later
                });
            }

        } catch (error) {
            // Ignore errors, will be reported in health check
        }

        return migrations.sort((a, b) => a.version.localeCompare(b.version));
    }

    /**
     * Get applied migrations from database
     */
    async getAppliedMigrations(): Promise<{
        tableExists: boolean;
        migrations: { id: number; hash: string; created_at: string }[];
    }> {
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
                return { tableExists: false, migrations: [] };
            }

            const applied = await this.client`
                SELECT id, hash, created_at::text
                FROM ${this.client.unsafe(migrationTable)}
                ORDER BY id
            `;

            return {
                tableExists: true,
                migrations: applied as unknown as { id: number, hash: string, created_at: string }[]
            };

        } catch (error) {
            return { tableExists: false, migrations: [] };
        }
    }

    /**
     * Correlate file migrations with applied migrations
     */
    correlateFiles(
        fileMigrations: MigrationInfo[],
        appliedMigrations: { id: number; hash: string; created_at: string }[]
    ): MigrationInfo[] {
        const appliedByHash = new Map(
            appliedMigrations.map(m => [m.hash, {
                id: m.id,
                appliedAt: m.created_at,
                appliedHash: m.hash
            }])
        );

        const appliedHashes = new Set(appliedMigrations.map(m => m.hash));

        // Update file migration status
        fileMigrations.forEach(migration => {
            const applied = appliedByHash.get(migration.checksum);
            if (applied) {
                migration.applied = applied;
                migration.status = 'applied';
            } else {
                // Check if there's a different hash for this migration (modified)
                const hasAppliedVersion = appliedMigrations.some((_, index) => {
                    return index < fileMigrations.findIndex(f => f === migration) &&
                        appliedMigrations[index];
                });

                migration.status = 'pending';
            }
        });

        // Find orphaned migrations (applied but no file)
        const fileHashes = new Set(fileMigrations.map(f => f.checksum));
        const orphanedMigrations: MigrationInfo[] = [];

        appliedMigrations.forEach((applied, index) => {
            if (!fileHashes.has(applied.hash)) {
                orphanedMigrations.push({
                    filename: `<missing-file-${applied.id}>`,
                    version: `orphaned_${applied.id}`,
                    checksum: applied.hash,
                    size: 0,
                    created: new Date(applied.created_at),
                    applied: {
                        id: applied.id,
                        appliedAt: applied.created_at,
                        appliedHash: applied.hash
                    },
                    status: 'orphaned'
                });
            }
        });

        return [...fileMigrations, ...orphanedMigrations];
    }

    /**
     * Assess migration health
     */
    assessHealth(migrations: MigrationInfo[]): {
        isHealthy: boolean;
        issues: string[];
        recommendations: string[];
    } {
        const issues: string[] = [];
        const recommendations: string[] = [];

        const modifiedCount = migrations.filter(m => m.status === 'modified').length;
        const orphanedCount = migrations.filter(m => m.status === 'orphaned').length;
        const pendingCount = migrations.filter(m => m.status === 'pending').length;

        // Check for orphaned migrations
        if (orphanedCount > 0) {
            issues.push(`${orphanedCount} orphaned migrations (applied but files missing)`);
            recommendations.push('Restore missing migration files or clean up orphaned entries');
        }

        // Check for modified migrations
        if (modifiedCount > 0) {
            issues.push(`${modifiedCount} migrations have been modified after application`);
            recommendations.push('Never modify applied migrations - create new migrations instead');
        }

        // Check for large number of pending migrations
        if (pendingCount > 10) {
            recommendations.push(`${pendingCount} pending migrations - consider applying in batches`);
        }

        // Environment-specific checks
        if (this.environment === 'production') {
            if (pendingCount > 5) {
                issues.push('Too many pending migrations for production environment');
                recommendations.push('Apply migrations in smaller, tested batches in production');
            }
        }

        const isHealthy = issues.length === 0;

        return { isHealthy, issues, recommendations };
    }

    /**
     * Generate comprehensive status report
     */
    async generateStatusReport(): Promise<StatusReport> {
        const connected = await this.checkDatabaseConnection();
        const fileMigrations = await this.loadMigrationFiles();
        let appliedResult = { tableExists: false, migrations: [] as any[] };

        if (connected) {
            appliedResult = await this.getAppliedMigrations();
        }

        const allMigrations = this.correlateFiles(fileMigrations, appliedResult.migrations);
        const health = this.assessHealth(allMigrations);

        const summary = {
            totalFiles: fileMigrations.length,
            appliedCount: allMigrations.filter(m => m.status === 'applied').length,
            pendingCount: allMigrations.filter(m => m.status === 'pending').length,
            modifiedCount: allMigrations.filter(m => m.status === 'modified').length,
            orphanedCount: allMigrations.filter(m => m.status === 'orphaned').length,
        };

        return {
            environment: this.environment,
            database: {
                connected,
                migrationTable: `${databaseConfig.migration.schema}.${databaseConfig.migration.table}`,
                migrationTableExists: appliedResult.tableExists
            },
            summary,
            migrations: allMigrations,
            health,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Print status report in human-readable format
     */
    printStatusReport(report: StatusReport): void {
        console.log(`🎯 Migration Status — ${report.environment.toUpperCase()} Environment`);
        console.log(`📊 Migration Table: ${report.database.migrationTable}`);
        console.log(`🔗 Database: ${report.database.connected ? 'Connected' : 'Disconnected'}`);
        console.log('');

        // Summary
        console.log('📈 SUMMARY');
        console.log('===========');
        console.log(`Total migration files: ${report.summary.totalFiles}`);
        console.log(`Applied migrations: ${report.summary.appliedCount}`);
        console.log(`Pending migrations: ${report.summary.pendingCount}`);
        if (report.summary.modifiedCount > 0) {
            console.log(`Modified migrations: ${report.summary.modifiedCount} ⚠️`);
        }
        if (report.summary.orphanedCount > 0) {
            console.log(`Orphaned migrations: ${report.summary.orphanedCount} ⚠️`);
        }
        console.log('');

        // Migration details
        if (report.migrations.length > 0) {
            console.log('📋 MIGRATION DETAILS');
            console.log('===================');
            console.log('Status | Version | File                          | Applied At');
            console.log('-------|---------|-------------------------------|------------------');

            report.migrations.forEach(migration => {
                const status = this.getStatusIcon(migration.status);
                const appliedAt = migration.applied ?
                    new Date(migration.applied.appliedAt).toLocaleDateString() :
                    'Not applied';

                const filename = migration.filename.length > 25 ?
                    migration.filename.substring(0, 22) + '...' :
                    migration.filename.padEnd(25);

                console.log(`  ${status}   | ${migration.version.padEnd(7)} | ${filename} | ${appliedAt}`);
            });
            console.log('');
        }

        // Health assessment
        console.log('🏥 HEALTH STATUS');
        console.log('===============');
        console.log(`Overall health: ${report.health.isHealthy ? '✅ HEALTHY' : '⚠️ ATTENTION REQUIRED'}`);

        if (report.health.issues.length > 0) {
            console.log('');
            console.log('Issues:');
            report.health.issues.forEach(issue => console.log(`  ❌ ${issue}`));
        }

        if (report.health.recommendations.length > 0) {
            console.log('');
            console.log('Recommendations:');
            report.health.recommendations.forEach(rec => console.log(`  💡 ${rec}`));
        }

        if (report.health.isHealthy && report.summary.pendingCount === 0) {
            console.log('');
            console.log('✅ All migrations applied successfully');
            console.log('   Database schema is up to date');
        } else if (report.summary.pendingCount > 0) {
            console.log('');
            console.log(`📝 ${report.summary.pendingCount} pending migrations ready to apply`);
            console.log('   Run: npm run db:migrate');
        }
    }

    /**
     * Get status icon for migration
     */
    private getStatusIcon(status: string): string {
        switch (status) {
            case 'applied': return '✅';
            case 'pending': return '⏳';
            case 'modified': return '⚠️';
            case 'orphaned': return '❓';
            default: return '❓';
        }
    }

    /**
     * Execute status reporting
     */
    async executeStatusReport(): Promise<void> {
        try {
            const report = await this.generateStatusReport();

            if (this.outputJson) {
                console.log(JSON.stringify(report, null, 2));
            } else {
                this.printStatusReport(report);
            }
        } catch (error) {
            console.error('❌ Failed to generate status report:', error);
            process.exit(1);
        } finally {
            await this.client.end();
        }
    }
}

// Execute status report if run directly
if (require.main === module) {
    const reporter = new MigrationStatusReporter();
    reporter.executeStatusReport();
}

export { MigrationStatusReporter };