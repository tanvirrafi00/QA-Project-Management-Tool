/**
 * Refresh-token repository — stores rotating refresh tokens as SHA-256 hashes (never the raw token).
 * Supports rotation (revoke-by-hash), global revocation (logout-everywhere), and pruning expired rows.
 */

import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "../../../shared/db";
import { refreshTokens } from "../../../shared/db/schema";

export interface CreateRefreshTokenRow {
    userId: string;
    tokenHash: string;
    expiresAt: string;
    userAgent?: string;
    ip?: string;
}

class RefreshTokenRepository {
    async create(input: CreateRefreshTokenRow): Promise<void> {
        await db.insert(refreshTokens).values(input);
    }

    /** Find a non-revoked token by hash (expiry is checked by the caller). */
    async findActiveByHash(tokenHash: string) {
        const [row] = await db
            .select()
            .from(refreshTokens)
            .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
            .limit(1);
        return row;
    }

    async revokeByHash(tokenHash: string): Promise<void> {
        await db
            .update(refreshTokens)
            .set({ revokedAt: new Date().toISOString() })
            .where(eq(refreshTokens.tokenHash, tokenHash));
    }

    async revokeAllForUser(userId: string): Promise<void> {
        await db
            .update(refreshTokens)
            .set({ revokedAt: new Date().toISOString() })
            .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    }

    async pruneExpired(): Promise<void> {
        await db
            .delete(refreshTokens)
            .where(lt(refreshTokens.expiresAt, new Date().toISOString()));
    }
}

export default new RefreshTokenRepository();
