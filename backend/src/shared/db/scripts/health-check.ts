#!/usr/bin/env tsx
/**
 * Database Health Check Script — AI QA Copilot
 * 
 * Comprehensive database health monitoring:
 * - Connection health validation
 * - Migration system status verification
 * - Schema integrity checking
 * - Performance metrics collection
 * - Configuration validation
 * - Environment-specific health assessments
 * 
 * Usage:
 *   npm run db:health
 *   npm run db:health --json
 *   npm run db:health --detailed
 * 
 * Exit codes:
 *   0 = Healthy
 *   1 = Issues detected
 *   2 = Critical failures
 * 
 * Validates: Requirements 1.3, 1.4, 2.2, 15.5
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readdir } from "fs/promises";
import { join } from "path";
import { databaseConfig, buildConnectionString, isDatabaseConfigured } from "../config";

interface HealthMetrics {
    connection: {
        status: 'healthy' | 'degraded' | 'failed';
        responseTime: number;
        error?: string;
    };
    configuration: {
        status: 'valid' | 'warnings' | 'invalid';
        issues: string[];
        warnings: string[];
    };
    migrations: {
        status: 'current' | 'pending' | 'missing' | 'error';
        tableExists: boolean;
        appliedCount: number;
        pendingCount: number;
        lastApplied?: string;
    };
    schema: {
        status: 'valid' | 'warnings' | 'error';
        issues: string[];
        tableCount: number;
        indexCount: number;
    };
    performance: {
        status: 'good' | 'degraded' | 'poor';
        connectionPoolSize: number;
        activeConnections: number;
        slowQueries?: number;
    };
    environment: {
        name: string;
        isProduction: boolean;
        recommendations: string[];
    };
}

interface HealthReport {
    timestamp: string;
    overall: 'healthy' | 'degraded' | 'critical';
    environment: string;
    metrics: HealthMetrics;
    summary: {
        healthy: number;
        warnings: number;
        critical: number;
    };
}

class DatabaseHealthChecker {
    private client: postgres.Sql;
    private db: ReturnType<typeof drizzle>;
    private migrationsPath: string;
    private environment: string;
    private outputJson: boolean;
    private detailed: boolean;

    constructor() {
        this.environment = process.env.NODE_ENV || 'development';
        this.migrationsPath = join(__dirname, '../migrations');
        this.outputJson = process.argv.includes('--json');
        this.detailed = process.argv.includes('--detailed');

        const connectionString = buildConnectionString(databaseConfig);
        this.client = postgres(connectionString, {
            max: 1,
            onnotice: () => { },
        });
        this.db = drizzle(this.client);
    }

    /**
     * Test database connection health
     */
    async checkConnectionHealth(): Promise<HealthMetrics['connection']> {
        const startTime = Date.now();

        try {
            await this.client`SELECT 1 as health_check, version() as db_version, now() as server_time`;
            const responseTime = Date.now() - startTime;

            return {
                status: responseTime < 100 ? 'healthy' : responseTime < 1000 ? 'degraded' : 'failed',
                responseTime
            };

        } catch (error) {
            return {
                status: 'failed',
                responseTime: Date.now() - startTime,
                error: String(error)
            };
        }
    }

    /**
     * Validate database configuration
     */
    checkConfiguration(): HealthMetrics['configuration'] {
        const issues: string[] = [];
        const warnings: string[] = [];

        try {
            if (!isDatabaseConfigured()) {
                issues.push('Database configuration is incomplete or invalid');
                return { status: 'invalid', issues, warnings };
            }

            // Environment-specific checks
            if (this.environment === 'production') {
                if (databaseConfig.ssl.mode === 'disable') {
                    warnings.push('SSL is disabled in production environment');
                }
                if (databaseConfig.pool.max < 10) {
                    warnings.push('Connection pool max size may be too small for production');
                }
                if (databaseConfig.password === 'postgres') {
                    issues.push('Using default password in production is insecure');
                }
            }

            // Pool configuration validation
            if (databaseConfig.pool.min > databaseConfig.pool.max) {
                issues.push('Pool min size cannot exceed max size');
            }

            // Timeout validation
            if (databaseConfig.pool.connectionTimeoutMillis > databaseConfig.pool.acquireTimeoutMillis) {
                warnings.push('Connection timeout exceeds acquire timeout');
            }

            const status = issues.length > 0 ? 'invalid' :
                warnings.length > 0 ? 'warnings' : 'valid';

            return { status, issues, warnings };

        } catch (error) {
            issues.push(`Configuration validation failed: ${error}`);
            return { status: 'invalid', issues, warnings };
        }
    }

    /**
     * Check migration system status
     */
    async checkMigrationStatus(): Promise<HealthMetrics['migrations']> {
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
                return {
                    status: 'missing',
                    tableExists: false,
                    appliedCount: 0,
                    pendingCount: 0
                };
            }

            // Get applied migrations
            const applied = await this.client`
                SELECT COUNT(*) as count, MAX(created_at) as last_applied
                FROM ${this.client.unsafe(migrationTable)}
            `;

            const appliedCount = parseInt(applied[0].count);
            const lastApplied = applied[0].last_applied;

            // Count migration files
            try {
                const files = await readdir(this.migrationsPath);
                const migrationFiles = files.filter(f => f.endsWith('.sql')).length;
                const pendingCount = Math.max(0, migrationFiles - appliedCount);

                const status = pendingCount === 0 ? 'current' :
                    pendingCount > 5 ? 'error' : 'pending';

                return {
                    status,
                    tableExists: true,
                    appliedCount,
                    pendingCount,
                    lastApplied: lastApplied ? new Date(lastApplied).toISOString() : undefined
                };

            } catch (fileError) {
                return {
                    status: 'error',
                    tableExists: true,
                    appliedCount,
                    pendingCount: 0
                };
            }

        } catch (error) {
            return {
                status: 'error',
                tableExists: false,
                appliedCount: 0,
                pendingCount: 0
            };
        }
    }

    /**
     * Check schema integrity
     */
    async checkSchemaHealth(): Promise<HealthMetrics['schema']> {
        const issues: string[] = [];
        let tableCount = 0;
        let indexCount = 0;

        try {
            // Count user tables (exclude system tables)
            const tables = await this.client`
                SELECT COUNT(*) as count 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_type = 'BASE TABLE'
            `;
            tableCount = parseInt(tables[0].count);

            // Count indexes
            const indexes = await this.client`
                SELECT COUNT(*) as count 
                FROM pg_indexes 
                WHERE schemaname = 'public'
            `;
            indexCount = parseInt(indexes[0].count);

            // Basic sanity checks
            if (tableCount === 0) {
                issues.push('No tables found in public schema');
            } else if (tableCount < 5) {
                // Expected core tables: users, projects, bugs, test_cases, etc.
                issues.push('Fewer tables than expected - schema may be incomplete');
            }

            // Check for required core tables
            const coreTables = ['users', 'projects', 'bugs', 'test_cases'];
            for (const table of coreTables) {
                const exists = await this.client`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = ${table}
                    )
                `;

                if (!exists[0].exists) {
                    issues.push(`Core table '${table}' is missing`);
                }
            }

            const status = issues.length > 0 ? 'error' : 'valid';

            return { status, issues, tableCount, indexCount };

        } catch (error) {
            issues.push(`Schema health check failed: ${error}`);
            return { status: 'error', issues, tableCount: 0, indexCount: 0 };
        }
    }

    /**
     * Check performance metrics
     */
    async checkPerformanceMetrics(): Promise<HealthMetrics['performance']> {
        try {
            // Get connection pool stats (simplified for postgres.js)
            const poolInfo = {
                connectionPoolSize: databaseConfig.pool.max,
                activeConnections: 1 // We only use 1 connection for health checks
            };

            // Check for slow queries (simplified approach)
            const slowQueries = await this.client`
                SELECT COUNT(*) as slow_count 
                FROM pg_stat_statements 
                WHERE mean_exec_time > 1000
            `.catch(() => [{ slow_count: 0 }]); // pg_stat_statements might not be installed

            const performance: HealthMetrics['performance'] = {
                status: 'good',
                connectionPoolSize: poolInfo.connectionPoolSize,
                activeConnections: poolInfo.activeConnections,
                slowQueries: parseInt(slowQueries[0].slow_count || 0)
            };

            // Assess performance status
            if (performance.slowQueries && performance.slowQueries > 10) {
                performance.status = 'poor';
            } else if (performance.slowQueries && performance.slowQueries > 5) {
                performance.status = 'degraded';
            }

            return performance;

        } catch (error) {
            return {
                status: 'poor',
                connectionPoolSize: databaseConfig.pool.max,
                activeConnections: 0
            };
        }
    }

    /**
     * Get environment-specific recommendations
     */
    getEnvironmentRecommendations(): HealthMetrics['environment'] {
        const recommendations: string[] = [];
        const isProduction = this.environment === 'production';

        if (isProduction) {
            recommendations.push('Ensure regular database backups are configured');
            recommendations.push('Monitor connection pool utilization');
            recommendations.push('Set up database performance monitoring');
            recommendations.push('Review and optimize slow queries regularly');
        } else {
            recommendations.push('Consider using migrations instead of schema push for team sync');
            recommendations.push('Regularly test migration rollback procedures');
            recommendations.push('Use seed data for consistent development setup');
        }

        // Environment-specific advice based on configuration
        if (databaseConfig.pool.max < 5) {
            recommendations.push('Consider increasing connection pool size for better concurrency');
        }

        return {
            name: this.environment,
            isProduction,
            recommendations
        };
    }

    /**
     * Generate comprehensive health report
     */
    async generateHealthReport(): Promise<HealthReport> {
        console.log('🏥 Performing database health check...');

        const metrics: HealthMetrics = {
            connection: await this.checkConnectionHealth(),
            configuration: this.checkConfiguration(),
            migrations: await this.checkMigrationStatus(),
            schema: await this.checkSchemaHealth(),
            performance: await this.checkPerformanceMetrics(),
            environment: this.getEnvironmentRecommendations()
        };

        // Calculate summary
        let healthy = 0;
        let warnings = 0;
        let critical = 0;

        // Assess each component
        [metrics.connection.status, metrics.configuration.status,
        metrics.migrations.status, metrics.schema.status,
        metrics.performance.status].forEach(status => {
            if (status === 'healthy' || status === 'valid' || status === 'current' || status === 'good') {
                healthy++;
            } else if (status === 'degraded' || status === 'warnings' || status === 'pending') {
                warnings++;
            } else {
                critical++;
            }
        });

        const overall: HealthReport['overall'] =
            critical > 0 ? 'critical' :
                warnings > 0 ? 'degraded' : 'healthy';

        return {
            timestamp: new Date().toISOString(),
            overall,
            environment: this.environment,
            metrics,
            summary: { healthy, warnings, critical }
        };
    }

    /**
     * Print health report in human-readable format
     */
    printHealthReport(report: HealthReport): void {
        const overallIcon = {
            healthy: '✅',
            degraded: '⚠️',
            critical: '❌'
        }[report.overall];

        console.log(`🎯 Database Health Report — ${report.environment.toUpperCase()}`);
        console.log(`📊 Overall Status: ${overallIcon} ${report.overall.toUpperCase()}`);
        console.log(`⏰ Checked at: ${new Date(report.timestamp).toLocaleString()}`);
        console.log('');

        // Connection Health
        const connIcon = report.metrics.connection.status === 'healthy' ? '✅' :
            report.metrics.connection.status === 'degraded' ? '⚠️' : '❌';
        console.log(`${connIcon} Connection: ${report.metrics.connection.status.toUpperCase()}`);
        console.log(`   Response time: ${report.metrics.connection.responseTime}ms`);
        if (report.metrics.connection.error && this.detailed) {
            console.log(`   Error: ${report.metrics.connection.error}`);
        }
        console.log('');

        // Configuration
        const configIcon = report.metrics.configuration.status === 'valid' ? '✅' :
            report.metrics.configuration.status === 'warnings' ? '⚠️' : '❌';
        console.log(`${configIcon} Configuration: ${report.metrics.configuration.status.toUpperCase()}`);
        if (report.metrics.configuration.issues.length > 0) {
            console.log('   Issues:');
            report.metrics.configuration.issues.forEach(issue => console.log(`     • ${issue}`));
        }
        if (report.metrics.configuration.warnings.length > 0 && this.detailed) {
            console.log('   Warnings:');
            report.metrics.configuration.warnings.forEach(warning => console.log(`     • ${warning}`));
        }
        console.log('');

        // Migrations
        const migIcon = report.metrics.migrations.status === 'current' ? '✅' :
            report.metrics.migrations.status === 'pending' ? '⚠️' : '❌';
        console.log(`${migIcon} Migrations: ${report.metrics.migrations.status.toUpperCase()}`);
        console.log(`   Applied: ${report.metrics.migrations.appliedCount}`);
        console.log(`   Pending: ${report.metrics.migrations.pendingCount}`);
        if (report.metrics.migrations.lastApplied) {
            console.log(`   Last applied: ${new Date(report.metrics.migrations.lastApplied).toLocaleString()}`);
        }
        console.log('');

        // Schema
        const schemaIcon = report.metrics.schema.status === 'valid' ? '✅' : '❌';
        console.log(`${schemaIcon} Schema: ${report.metrics.schema.status.toUpperCase()}`);
        console.log(`   Tables: ${report.metrics.schema.tableCount}`);
        console.log(`   Indexes: ${report.metrics.schema.indexCount}`);
        if (report.metrics.schema.issues.length > 0) {
            console.log('   Issues:');
            report.metrics.schema.issues.forEach(issue => console.log(`     • ${issue}`));
        }
        console.log('');

        // Performance  
        const perfIcon = report.metrics.performance.status === 'good' ? '✅' :
            report.metrics.performance.status === 'degraded' ? '⚠️' : '❌';
        console.log(`${perfIcon} Performance: ${report.metrics.performance.status.toUpperCase()}`);
        console.log(`   Pool size: ${report.metrics.performance.connectionPoolSize}`);
        console.log(`   Active connections: ${report.metrics.performance.activeConnections}`);
        if (report.metrics.performance.slowQueries && this.detailed) {
            console.log(`   Slow queries: ${report.metrics.performance.slowQueries}`);
        }
        console.log('');

        // Recommendations
        if (report.metrics.environment.recommendations.length > 0) {
            console.log('💡 Recommendations:');
            report.metrics.environment.recommendations.forEach(rec => console.log(`   • ${rec}`));
            console.log('');
        }

        // Summary
        console.log('📈 HEALTH SUMMARY');
        console.log('================');
        console.log(`Healthy components: ${report.summary.healthy}`);
        console.log(`Components with warnings: ${report.summary.warnings}`);
        console.log(`Critical issues: ${report.summary.critical}`);
    }

    /**
     * Execute health check and report results
     */
    async executeHealthCheck(): Promise<void> {
        try {
            const report = await this.generateHealthReport();

            if (this.outputJson) {
                console.log(JSON.stringify(report, null, 2));
            } else {
                this.printHealthReport(report);
            }

            // Exit with appropriate code
            const exitCode = report.overall === 'healthy' ? 0 :
                report.overall === 'degraded' ? 1 : 2;
            process.exit(exitCode);

        } catch (error) {
            console.error('❌ Health check failed:', error);
            process.exit(2);
        } finally {
            await this.client.end();
        }
    }
}

// Execute health check if run directly
if (require.main === module) {
    const healthChecker = new DatabaseHealthChecker();
    healthChecker.executeHealthCheck();
}

export { DatabaseHealthChecker };