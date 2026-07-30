/**
 * Database Availability Management — AI QA Copilot
 * 
 * Implements comprehensive database availability checks and fallback mechanisms
 * to handle cases when PostgreSQL is unavailable.
 * 
 * Features:
 * - Enhanced startup connection validation with detailed diagnostics
 * - Fallback mechanism detection and management
 * - Availability status tracking and reporting
 * - Error categorization and appropriate messaging
 * 
 * Validates: Requirements 1.3, 1.4, 1.6
 */

import { Pool, PoolClient } from 'pg';
import logger from '../logger';
import { databaseConfig, isDatabaseConfigured, getPoolConfig, buildConnectionString } from './config';
import { withConnectionRetry } from './client';

/**
 * Database availability status
 */
export enum DatabaseAvailabilityStatus {
    AVAILABLE = 'available',
    UNAVAILABLE = 'unavailable',
    DEGRADED = 'degraded',
    UNKNOWN = 'unknown'
}

/**
 * Database connectivity diagnostic information
 */
export interface DatabaseDiagnostics {
    status: DatabaseAvailabilityStatus;
    connectionTime?: number;
    errorType?: string;
    errorMessage?: string;
    errorCode?: string;
    retryAttempts?: number;
    serverInfo?: {
        version: string;
        databaseName: string;
        currentUser: string;
        serverTime: string;
        connectionCount?: number;
        uptime?: string;
    };
    poolHealth?: {
        totalConnections: number;
        idleConnections: number;
        waitingConnections: number;
        utilizationPercent: number;
        healthStatus: 'healthy' | 'warning' | 'critical';
    };
    fallbackMode?: {
        active: boolean;
        type: 'in-memory' | 'cache' | 'read-only';
        limitations: string[];
    };
    troubleshooting?: {
        recommendedActions: string[];
        configurationIssues: string[];
        networkDiagnostics?: string[];
    };
}

/**
 * Database availability check result
 */
export interface AvailabilityCheckResult {
    success: boolean;
    diagnostics: DatabaseDiagnostics;
    timestamp: Date;
    duration: number;
}

/**
 * Enhanced database availability checker
 */
export class DatabaseAvailabilityManager {
    private static instance: DatabaseAvailabilityManager | null = null;
    private lastCheckResult: AvailabilityCheckResult | null = null;
    private checkInProgress = false;

    private constructor() { }

    public static getInstance(): DatabaseAvailabilityManager {
        if (!DatabaseAvailabilityManager.instance) {
            DatabaseAvailabilityManager.instance = new DatabaseAvailabilityManager();
        }
        return DatabaseAvailabilityManager.instance;
    }

    /**
     * Comprehensive database availability check
     * Validates: Requirements 1.3, 1.4
     */
    public async checkAvailability(): Promise<AvailabilityCheckResult> {
        if (this.checkInProgress) {
            // Return cached result if check is in progress
            return this.lastCheckResult || this.createUnavailableResult('Check already in progress');
        }

        this.checkInProgress = true;
        const startTime = Date.now();

        try {
            // Check if database is configured
            if (!isDatabaseConfigured()) {
                return this.createConfigurationResult();
            }

            // Perform comprehensive availability check
            const diagnostics = await this.performComprehensiveCheck();
            const duration = Date.now() - startTime;

            const result: AvailabilityCheckResult = {
                success: diagnostics.status === DatabaseAvailabilityStatus.AVAILABLE,
                diagnostics,
                timestamp: new Date(),
                duration
            };

            this.lastCheckResult = result;
            return result;

        } catch (error) {
            const duration = Date.now() - startTime;
            const result = this.createErrorResult(error, duration);
            this.lastCheckResult = result;
            return result;
        } finally {
            this.checkInProgress = false;
        }
    }

    /**
     * Perform comprehensive database availability diagnostics
     */
    private async performComprehensiveCheck(): Promise<DatabaseDiagnostics> {
        let pool: Pool | null = null;
        let client: PoolClient | null = null;
        const startTime = Date.now();

        try {
            // Create connection pool for testing
            const poolConfig = getPoolConfig(databaseConfig);
            pool = new Pool(poolConfig);

            // Test connection with retry logic
            client = await withConnectionRetry(
                async () => {
                    return await pool!.connect();
                },
                'availability check connection'
            );

            if (!client) {
                throw new Error('Failed to obtain database client');
            }

            const connectionTime = Date.now() - startTime;

            // Perform comprehensive database diagnostics
            const serverInfo = await this.gatherServerInfo(client);
            const poolHealth = this.assessPoolHealth(pool!);

            const diagnostics: DatabaseDiagnostics = {
                status: DatabaseAvailabilityStatus.AVAILABLE,
                connectionTime,
                serverInfo,
                poolHealth,
                fallbackMode: {
                    active: false,
                    type: 'in-memory',
                    limitations: []
                }
            };

            return diagnostics;

        } catch (error) {
            const connectionTime = Date.now() - startTime;
            return this.createErrorDiagnostics(error, connectionTime);
        } finally {
            // Clean up connections
            if (client) {
                try {
                    client.release();
                } catch (releaseError) {
                    logger.warn('Failed to release test client', { error: releaseError });
                }
            }
            if (pool) {
                try {
                    await pool.end();
                } catch (endError) {
                    logger.warn('Failed to end test pool', { error: endError });
                }
            }
        }
    }

    /**
     * Gather detailed server information for diagnostics
     */
    private async gatherServerInfo(client: PoolClient) {
        try {
            const queries = [
                { name: 'version', query: 'SELECT version() as version' },
                { name: 'database', query: 'SELECT current_database() as database_name, current_user as current_user, current_timestamp as server_time' },
                { name: 'connections', query: 'SELECT count(*) as connection_count FROM pg_stat_activity WHERE datname = current_database()' },
                { name: 'uptime', query: 'SELECT current_timestamp - pg_postmaster_start_time() as uptime' }
            ];

            const results: any = {};

            for (const { name, query } of queries) {
                try {
                    const result = await client.query(query);
                    results[name] = result.rows[0];
                } catch (queryError) {
                    logger.warn(`Failed to execute ${name} query`, { error: queryError });
                }
            }

            return {
                version: results.version?.version || 'Unknown',
                databaseName: results.database?.database_name || databaseConfig.database,
                currentUser: results.database?.current_user || databaseConfig.username,
                serverTime: results.database?.server_time || new Date().toISOString(),
                connectionCount: results.connections?.connection_count || 0,
                uptime: results.uptime?.uptime || 'Unknown'
            };
        } catch (error) {
            logger.warn('Failed to gather server info', { error });
            return {
                version: 'Unknown',
                databaseName: databaseConfig.database,
                currentUser: databaseConfig.username,
                serverTime: new Date().toISOString()
            };
        }
    }

    /**
     * Assess connection pool health
     */
    private assessPoolHealth(pool: Pool) {
        try {
            const totalConnections = pool.totalCount;
            const idleConnections = pool.idleCount;
            const waitingConnections = pool.waitingCount;
            const utilizationPercent = Math.round((totalConnections / databaseConfig.pool.max) * 100);

            let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
            if (utilizationPercent > 80 || waitingConnections > totalConnections) {
                healthStatus = 'warning';
            }
            if (totalConnections === 0 || waitingConnections > databaseConfig.pool.max) {
                healthStatus = 'critical';
            }

            return {
                totalConnections,
                idleConnections,
                waitingConnections,
                utilizationPercent,
                healthStatus
            };
        } catch (error) {
            logger.warn('Failed to assess pool health', { error });
            return {
                totalConnections: 0,
                idleConnections: 0,
                waitingConnections: 0,
                utilizationPercent: 0,
                healthStatus: 'critical' as const
            };
        }
    }

    /**
     * Create error diagnostics from connection failure
     */
    private createErrorDiagnostics(error: any, connectionTime: number): DatabaseDiagnostics {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = error?.code;

        // Categorize error types
        const { status, troubleshooting } = this.categorizeError(error);

        return {
            status,
            connectionTime,
            errorType: this.getErrorType(errorCode),
            errorMessage,
            errorCode,
            fallbackMode: {
                active: true,
                type: 'in-memory',
                limitations: [
                    'Data will not persist across server restarts',
                    'No cross-instance data sharing',
                    'Limited to single process memory'
                ]
            },
            troubleshooting
        };
    }

    /**
     * Categorize database errors and provide specific guidance
     */
    private categorizeError(error: any): { status: DatabaseAvailabilityStatus; troubleshooting: any } {
        const errorCode = error?.code;
        const errorMessage = error?.message?.toLowerCase() || '';

        const troubleshooting = {
            recommendedActions: [] as string[],
            configurationIssues: [] as string[],
            networkDiagnostics: [] as string[]
        };

        // Connection refused errors
        if (errorCode === 'ECONNREFUSED') {
            troubleshooting.recommendedActions.push('Verify PostgreSQL server is running');
            troubleshooting.recommendedActions.push('Check if PostgreSQL is listening on the configured port');
            troubleshooting.networkDiagnostics.push(`Test connection: telnet ${databaseConfig.host} ${databaseConfig.port}`);
            return { status: DatabaseAvailabilityStatus.UNAVAILABLE, troubleshooting };
        }

        // DNS/Host resolution errors
        if (errorCode === 'ENOTFOUND') {
            troubleshooting.configurationIssues.push('Database host not found - check DB_HOST configuration');
            troubleshooting.networkDiagnostics.push(`Test DNS resolution: nslookup ${databaseConfig.host}`);
            return { status: DatabaseAvailabilityStatus.UNAVAILABLE, troubleshooting };
        }

        // Authentication errors
        if (errorCode === '28P01') {
            troubleshooting.configurationIssues.push('Database authentication failed - check credentials');
            troubleshooting.recommendedActions.push('Verify DB_USER and DB_PASSWORD are correct');
            troubleshooting.recommendedActions.push('Check user permissions in PostgreSQL');
            return { status: DatabaseAvailabilityStatus.UNAVAILABLE, troubleshooting };
        }

        // Database not found
        if (errorCode === '3D000') {
            troubleshooting.configurationIssues.push('Database does not exist - check DB_NAME configuration');
            troubleshooting.recommendedActions.push(`Create database: CREATE DATABASE ${databaseConfig.database};`);
            return { status: DatabaseAvailabilityStatus.UNAVAILABLE, troubleshooting };
        }

        // Timeout errors
        if (errorCode === 'ETIMEDOUT' || errorMessage.includes('timeout')) {
            troubleshooting.networkDiagnostics.push('Connection timeout - check network connectivity');
            troubleshooting.configurationIssues.push('Consider increasing connection timeout values');
            return { status: DatabaseAvailabilityStatus.DEGRADED, troubleshooting };
        }

        // SSL errors
        if (errorMessage.includes('ssl') || errorMessage.includes('certificate')) {
            troubleshooting.configurationIssues.push('SSL connection issue - check SSL configuration');
            troubleshooting.recommendedActions.push('Verify SSL certificates and mode configuration');
            return { status: DatabaseAvailabilityStatus.UNAVAILABLE, troubleshooting };
        }

        // Too many connections
        if (errorCode === '53300' || errorMessage.includes('too many connections')) {
            troubleshooting.recommendedActions.push('Database connection pool is exhausted');
            troubleshooting.configurationIssues.push('Consider increasing PostgreSQL max_connections');
            troubleshooting.configurationIssues.push('Review connection pool configuration');
            return { status: DatabaseAvailabilityStatus.DEGRADED, troubleshooting };
        }

        // Generic error handling
        troubleshooting.recommendedActions.push('Check PostgreSQL server logs for details');
        troubleshooting.recommendedActions.push('Verify database configuration and network connectivity');
        return { status: DatabaseAvailabilityStatus.UNKNOWN, troubleshooting };
    }

    /**
     * Get human-readable error type from error code
     */
    private getErrorType(errorCode: string | undefined): string {
        const errorTypeMap: Record<string, string> = {
            'ECONNREFUSED': 'Connection Refused',
            'ENOTFOUND': 'Host Not Found',
            'ETIMEDOUT': 'Connection Timeout',
            'ECONNRESET': 'Connection Reset',
            'EHOSTUNREACH': 'Host Unreachable',
            '28P01': 'Authentication Failed',
            '3D000': 'Database Not Found',
            '53300': 'Too Many Connections',
            '08006': 'Connection Failure',
            '08001': 'Unable to Connect',
            '57P03': 'Cannot Connect Now'
        };

        return errorTypeMap[errorCode || ''] || 'Unknown Error';
    }

    /**
     * Create result for configuration issues
     */
    private createConfigurationResult(): AvailabilityCheckResult {
        const diagnostics: DatabaseDiagnostics = {
            status: DatabaseAvailabilityStatus.UNAVAILABLE,
            errorType: 'Configuration Error',
            errorMessage: 'Database configuration is incomplete',
            fallbackMode: {
                active: true,
                type: 'in-memory',
                limitations: [
                    'Data will not persist across server restarts',
                    'Database features are disabled'
                ]
            },
            troubleshooting: {
                recommendedActions: [
                    'Set DATABASE_URL environment variable, or',
                    'Set discrete database environment variables (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)'
                ],
                configurationIssues: [
                    'Missing required database configuration',
                    'Review environment variables and configuration file'
                ]
            }
        };

        return {
            success: false,
            diagnostics,
            timestamp: new Date(),
            duration: 0
        };
    }

    /**
     * Create result for general errors
     */
    private createErrorResult(error: any, duration: number): AvailabilityCheckResult {
        const diagnostics = this.createErrorDiagnostics(error, duration);

        return {
            success: false,
            diagnostics,
            timestamp: new Date(),
            duration
        };
    }

    /**
     * Create result for unavailable status with message
     */
    private createUnavailableResult(message: string): AvailabilityCheckResult {
        const diagnostics: DatabaseDiagnostics = {
            status: DatabaseAvailabilityStatus.UNKNOWN,
            errorMessage: message,
            fallbackMode: {
                active: true,
                type: 'in-memory',
                limitations: ['Limited functionality until availability check completes']
            }
        };

        return {
            success: false,
            diagnostics,
            timestamp: new Date(),
            duration: 0
        };
    }

    /**
     * Get the last availability check result
     */
    public getLastCheckResult(): AvailabilityCheckResult | null {
        return this.lastCheckResult;
    }

    /**
     * Check if database is currently available based on last check
     */
    public isAvailable(): boolean {
        return this.lastCheckResult?.success || false;
    }

    /**
     * Get current database status
     */
    public getStatus(): DatabaseAvailabilityStatus {
        return this.lastCheckResult?.diagnostics.status || DatabaseAvailabilityStatus.UNKNOWN;
    }

    /**
     * Get fallback mode information
     */
    public getFallbackMode() {
        return this.lastCheckResult?.diagnostics.fallbackMode || {
            active: true,
            type: 'in-memory' as const,
            limitations: ['Database availability unknown']
        };
    }

    /**
     * Format availability report for logging
     */
    public formatAvailabilityReport(result: AvailabilityCheckResult): string {
        const { success, diagnostics, duration } = result;
        const status = success ? '✅ AVAILABLE' : '❌ UNAVAILABLE';

        let report = `Database Status: ${status} (${duration}ms)\n`;

        if (diagnostics.serverInfo) {
            report += `  Server: ${diagnostics.serverInfo.version.split(' ')[1] || 'Unknown'}\n`;
            report += `  Database: ${diagnostics.serverInfo.databaseName}\n`;
            report += `  User: ${diagnostics.serverInfo.currentUser}\n`;
            if (diagnostics.serverInfo.connectionCount !== undefined) {
                report += `  Connections: ${diagnostics.serverInfo.connectionCount}\n`;
            }
        }

        if (diagnostics.poolHealth) {
            report += `  Pool Health: ${diagnostics.poolHealth.healthStatus} (${diagnostics.poolHealth.utilizationPercent}% utilized)\n`;
            report += `  Pool Stats: ${diagnostics.poolHealth.totalConnections} total, ${diagnostics.poolHealth.idleConnections} idle, ${diagnostics.poolHealth.waitingConnections} waiting\n`;
        }

        if (diagnostics.fallbackMode?.active) {
            report += `  Fallback: ${diagnostics.fallbackMode.type} mode active\n`;
            if (diagnostics.fallbackMode.limitations.length > 0) {
                report += `  Limitations: ${diagnostics.fallbackMode.limitations.join(', ')}\n`;
            }
        }

        if (diagnostics.errorMessage) {
            report += `  Error: ${diagnostics.errorType || 'Unknown'} - ${diagnostics.errorMessage}\n`;
        }

        if (diagnostics.troubleshooting?.recommendedActions?.length) {
            report += `  Actions: ${diagnostics.troubleshooting.recommendedActions.slice(0, 2).join(', ')}\n`;
        }

        return report.trim();
    }
}

/**
 * Enhanced startup database validation with fallback management
 * Validates: Requirements 1.3, 1.4, 1.6
 */
export async function validateDatabaseAvailabilityOnStartup(): Promise<{
    available: boolean;
    fallbackActive: boolean;
    diagnostics: DatabaseDiagnostics;
    shouldContinue: boolean;
    message: string;
}> {
    logger.info('🔍 Performing database availability check...');

    const availabilityManager = DatabaseAvailabilityManager.getInstance();
    const result = await availabilityManager.checkAvailability();

    const report = availabilityManager.formatAvailabilityReport(result);
    logger.info('Database availability check completed:\n' + report);

    // Determine startup behavior based on environment and availability
    const shouldContinue = result.success || databaseConfig.environment !== 'production';
    const fallbackActive = !result.success;

    let message = '';
    if (result.success) {
        message = `Database is available and ready for production traffic`;
    } else if (databaseConfig.environment === 'production') {
        message = `CRITICAL: Database is unavailable in production environment - startup will fail`;
    } else {
        message = `Database is unavailable - continuing with in-memory fallback for ${databaseConfig.environment} environment`;
    }

    return {
        available: result.success,
        fallbackActive,
        diagnostics: result.diagnostics,
        shouldContinue,
        message
    };
}

/**
 * Get database availability status for API responses
 * Validates: Requirement 1.4
 */
export function getDatabaseAvailabilityStatus() {
    const availabilityManager = DatabaseAvailabilityManager.getInstance();
    const lastCheck = availabilityManager.getLastCheckResult();

    if (!lastCheck) {
        return {
            status: DatabaseAvailabilityStatus.UNKNOWN,
            message: 'Database availability not yet checked',
            fallbackMode: true
        };
    }

    return {
        status: lastCheck.diagnostics.status,
        message: lastCheck.success ?
            'Database is available and ready' :
            `Database is unavailable: ${lastCheck.diagnostics.errorMessage}`,
        fallbackMode: lastCheck.diagnostics.fallbackMode?.active || false,
        lastChecked: lastCheck.timestamp,
        connectionTime: lastCheck.diagnostics.connectionTime
    };
}

// Export singleton instance
export const databaseAvailability = DatabaseAvailabilityManager.getInstance();