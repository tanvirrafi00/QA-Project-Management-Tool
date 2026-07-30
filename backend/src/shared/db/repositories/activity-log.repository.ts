/**
 * Activity Log Repository — the unified audit feed (`activity_log`).
 *
 * SQL-only (no in-memory equivalent). Best-effort: every call is guarded by `isDbConfigured()` and
 * wrapped in try/catch so an audit failure NEVER breaks the primary mutation. Written AFTER a
 * mutation commits (by the SQL repositories) so only successful changes are audited.
 *
 * Migration Roadmap Step 3.5.
 */

import { db, isDbConfigured } from "../client";
import { activityLog } from "../schema";
import logger from "../../logger";

export interface ActivityLogEntry {
    actorId?: string | null; // null until RBAC lands (Step 6) — then req.user.id
    action: string; // e.g. 'project.created', 'bug.updated'
    entityType: string; // 'project' | 'bug' | 'test_case' | 'generation'
    entityId?: string | null;
    projectId?: string | null;
    metadata?: Record<string, unknown>;
}

class ActivityLogRepository {
    async log(entry: ActivityLogEntry): Promise<void> {
        if (!isDbConfigured()) return;
        try {
            await db.insert(activityLog).values({
                actorId: entry.actorId ?? null,
                action: entry.action,
                entityType: entry.entityType,
                entityId: entry.entityId ?? null,
                projectId: entry.projectId ?? null,
                metadata: entry.metadata ?? {},
            });
        } catch (err) {
            logger.warn("activity_log write failed (best-effort)", {
                action: entry.action,
                message: (err as Error).message,
            });
        }
    }
}

export default new ActivityLogRepository();
