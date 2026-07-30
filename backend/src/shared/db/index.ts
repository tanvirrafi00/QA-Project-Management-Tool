/**
 * Database barrel — exports the Drizzle client, configuration, and the full schema.
 *
 * Consumers (repositories, services) should import from here:
 *   import { db, schema, databaseConfig } from "@/shared/db";   // or relative path
 *   const rows = await db.select().from(schema.bugs);
 */

export { default, db, pool, closeDb, isDbConfigured, validateConnection, withRetry, getPoolStats, getDb, ensureDbInitialized } from "./client";
export type { DbClient } from "./client";
export type { NodePgDatabase } from "drizzle-orm/node-postgres";
export { databaseConfig, loadDatabaseConfig, buildConnectionString, getPoolConfig, isDatabaseConfigured, getEnvironmentConfig } from "./config";
export type { DatabaseConfig } from "./config";
export * as schema from "./schema";

// Persistence infrastructure (Phase 2 / Phase 5 of the PostgreSQL migration).
export {
    mapDatabaseError,
    mapDbErrors,
    isDatabaseError,
    isConnectionError,
    PgSqlState,
} from "./errors";
export { withTransaction, withMappedErrors } from "./transactions";
export type { TransactionFn } from "./transactions";

// Pure audit/soft-delete/optimistic-lock helpers (no DB client dependency — safe to import anywhere).
export {
    resolveActor,
    auditOnCreate,
    auditOnUpdate,
    notDeleted,
    softDeleteSet,
    versionMatch,
} from "./audit-columns";
export type { AuditColumns, AuditInsertInput, AuditUpdateInput } from "./audit-columns";

export { BaseSqlRepository } from "./base.repository";
