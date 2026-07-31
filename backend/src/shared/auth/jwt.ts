/**
 * JWT signing/verification. Access tokens are short-lived and self-describe the `SessionUser`;
 * refresh tokens are opaque (only carry a subject) and are rotated + revocable via `refresh_tokens`.
 *
 * Secrets/TTLs come from env (see `.env.example`). In dev, non-empty defaults keep things runnable;
 * `validateJwtConfig()` (called at startup) fails fast in production when the secrets are missing,
 * left at the dev defaults, or shared between access and refresh (which would let a refresh token be
 * verified as an access token).
 *
 * Token-type confusion is prevented by a `typ` claim ("access" / "refresh") that the verifiers
 * enforce, so a refresh token can never satisfy `verifyAccess` and vice versa.
 */

import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import type { SessionUser } from "./session";

const DEV_ACCESS_FALLBACK = "dev-access-secret-change-me";
const DEV_REFRESH_FALLBACK = "dev-refresh-secret-change-me";

const ACCESS_SECRET = process.env.JWT_SECRET || DEV_ACCESS_FALLBACK;
const REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || DEV_REFRESH_FALLBACK;
export const ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || "7d";

/**
 * Fail-fast JWT secret validation. In production the access/refresh secrets must each be set
 * explicitly (not the dev fallbacks) and must differ from each other — otherwise tokens are either
 * forgeable (publicly-known secret) or interchangeable across token types. Outside production we
 * warn loudly but stay runnable for local dev. Call once at startup (see `index.ts`).
 */
export function validateJwtConfig(): void {
    const isProd = process.env.NODE_ENV === "production";
    const access = process.env.JWT_SECRET;
    const refresh = process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET;
    const problems: string[] = [];
    if (!access || access === DEV_ACCESS_FALLBACK) {
        problems.push("JWT_SECRET must be set to a strong, unique value");
    }
    if (!refresh || refresh === DEV_REFRESH_FALLBACK) {
        problems.push("JWT_REFRESH_SECRET must be set to a strong, unique value");
    }
    if (access && refresh && access === refresh) {
        problems.push(
            "JWT_REFRESH_SECRET must differ from JWT_SECRET (prevents access/refresh token confusion)",
        );
    }
    if (problems.length === 0) return;
    if (isProd) {
        throw new Error("Refusing to start: insecure JWT configuration — " + problems.join("; "));
    }
    // eslint-disable-next-line no-console
    console.warn(`⚠ Insecure JWT configuration (ignored outside production): ${problems.join("; ")}`);
}

/** Refresh-token lifetime in ms, used to set `refresh_tokens.expires_at`. Must track REFRESH_TTL. */
export const REFRESH_TTL_MS = parseTtlToMs(REFRESH_TTL);

/** Lifetimes in SECONDS for `jwt.sign` `expiresIn` (jsonwebtoken treats a numeric expiresIn as seconds). */
const ACCESS_TTL_SEC = Math.floor(parseTtlToMs(ACCESS_TTL) / 1000);
const REFRESH_TTL_SEC = Math.floor(REFRESH_TTL_MS / 1000);

export function signAccess(user: SessionUser): string {
    return jwt.sign(
        {
            sub: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
            typ: "access",
        },
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

/** Verify an access token and reconstitute the `SessionUser`. Throws on invalid/expired/wrong-type. */
export function verifyAccess(token: string): SessionUser {
    const payload = jwt.verify(token, ACCESS_SECRET) as jwt.JwtPayload;
    if (payload.typ !== "access") {
        // Rejects refresh tokens (or anything without the access type claim) used as an access token.
        throw new jwt.JsonWebTokenError("Not an access token");
    }
    return {
        id: String(payload.sub),
        email: String(payload.email),
        name: String(payload.name),
        role: payload.role as SessionUser["role"],
        status: payload.status as SessionUser["status"],
    };
}

/** Verify a refresh token. Throws on invalid/expired/wrong-type. */
export function verifyRefresh(token: string): { sub: string } {
    const payload = jwt.verify(token, REFRESH_SECRET) as jwt.JwtPayload;
    if (payload.typ !== "refresh") {
        throw new jwt.JsonWebTokenError("Not a refresh token");
    }
    return { sub: String(payload.sub) };
}

/**
 * Parse common JWT TTL strings ("15m", "7d", "2h", "3600s") to milliseconds. Throws on a malformed
 * value rather than silently falling back to 7d — a numeric/typo'd TTL would otherwise produce
 * 7-day access tokens instead of erroring, the opposite of the intended short-lived access window.
 */
export function parseTtlToMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) {
        throw new Error(
            `Invalid TTL format: "${ttl}". Expected e.g. "15m", "2h", "7d", "3600s".`,
        );
    }
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * multipliers[unit];
}
