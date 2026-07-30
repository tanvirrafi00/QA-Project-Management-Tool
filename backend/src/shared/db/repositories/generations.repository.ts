/**
 * Generations Repository — AI provenance (`generations`).
 *
 * SQL-only. Best-effort: guarded by `isDbConfigured()` + try/catch so a provenance write never breaks
 * a generation request. The generation services call `record(...)` on success and failure.
 *
 * Migration Roadmap Step 3.5.
 */

import { db, isDbConfigured } from "../client";
import { generations } from "../schema";
import logger from "../../logger";

export interface GenerationRecord {
    projectId?: string | null;
    module?: string | null;
    subModule?: string | null;
    feature?: string | null;
    provider?: string | null;
    model?: string | null;
    agents: string[];
    rawCaseCount?: number | null;
    mergedCaseCount?: number | null;
    duplicatesRemoved?: number | null;
    coverageScore?: number | null;
    status: "succeeded" | "failed";
    error?: string | null;
    durationMs?: number | null;
    createdBy?: string | null;
}

class GenerationsRepository {
    async record(g: GenerationRecord): Promise<void> {
        if (!isDbConfigured()) return;
        try {
            await db.insert(generations).values({
                projectId: g.projectId ?? null,
                module: g.module ?? null,
                subModule: g.subModule ?? null,
                feature: g.feature ?? null,
                provider: g.provider ?? null,
                model: g.model ?? null,
                agents: g.agents,
                rawCaseCount: g.rawCaseCount ?? null,
                mergedCaseCount: g.mergedCaseCount ?? null,
                duplicatesRemoved: g.duplicatesRemoved ?? null,
                coverageScore: g.coverageScore != null ? String(g.coverageScore) : null,
                status: g.status,
                error: g.error ?? null,
                durationMs: g.durationMs ?? null,
                createdBy: g.createdBy ?? null,
            });
        } catch (err) {
            logger.warn("generations write failed (best-effort)", { message: (err as Error).message });
        }
    }
}

export default new GenerationsRepository();
