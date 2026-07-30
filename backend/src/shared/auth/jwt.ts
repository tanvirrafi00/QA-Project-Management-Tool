/**
 * JWT signing/verification. Access tokens are short-lived and self-describe the `SessionUser`;
 * refresh tokens are opaque (only carry a subject) and are rotated + revocable via `refresh_tokens`.
 *
 * Secrets/TTLs come from env (see `.env.example`). In dev, non-empty defaults keep things runnable.
 */

import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import type { SessionUser } from "./session";

const ACCESS_SECRET = process.env.JWT_SECRET || "dev-access-secret-change-me";
const REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "dev-refresh-secret-change-me";
export const ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || "7d";

/** Refresh-token lifetime in ms, used to set `refresh_tokens.expires_at`. Must track REFRESH_TTL. */
export const REFRESH_TTL_MS = parseTtlToMs(REFRESH_TTL);

/** Lifetimes in SECONDS for `jwt.sign` `expiresIn` (jsonwebtoken treats a numeric expiresIn as seconds). */
const ACCESS_TTL_SEC = Math.floor(parseTtlToMs(ACCESS_TTL) / 1000);
const REFRESH_TTL_SEC = Math.floor(REFRESH_TTL_MS / 1000);

export function signAccess(user: SessionUser): string {
    return jwt.sign(
        { sub: user.id, email: user.email, name: user.name, role: user.role, status: user.status },
        ACCESS_SECRET,
        { expiresIn: ACCESS_TTL_SEC, jwtid: randomUUID() },
    );
}

/**
 * Sign a refresh token. A random `jti` (JWT ID) is embedded so that two tokens issued for the same
 * user within the same second are still distinct strings — and therefore distinct SHA-256 hashes.
 * Without this, `iat` (second-resolution) + identical payload would yield identical tokens, and the
 * `refresh_tokens_token_hash_uidx` unique index would reject the rotated insert with a 500.
 */
export function signRefresh(userId: string): string {
    return jwt.sign({ sub: userId, typ: "refresh" }, REFRESH_SECRET, {
        expiresIn: REFRESH_TTL_SEC,
        jwtid: randomUUID(),
    });
}

/** Verify an access token and reconstitute the `SessionUser`. Throws on invalid/expired. */
export function verifyAccess(token: string): SessionUser {
    const payload = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;
    return {
        id: String(payload.sub),
        email: String(payload.email),
        name: String(payload.name),
        role: payload.role as SessionUser["role"],
        status: payload.status as SessionUser["status"],
    };
}

/** Verify a refresh token. Throws on invalid/expired. */
export function verifyRefresh(token: string): { sub: string } {
    const payload = jwt.verify(token, REFRESH_SECRET) as jwt.JwtPayload;
    return { sub: String(payload.sub) };
}

/** Parse common JWT TTL strings ("15m", "7d", "2h", "3600s") to milliseconds. */
function parseTtlToMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * (multipliers[unit] ?? 86_400_000);
}
