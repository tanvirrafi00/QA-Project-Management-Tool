/**
 * Password hashing + opaque token hashing.
 *
 * Passwords are hashed with **Argon2id** (`@node-rs/argon2`, prebuilt — no native compile). For a
 * smooth migration off the previous bcrypt hashes, `verifyPassword` still accepts legacy `$2*` hashes.
 * Refresh tokens are stored only as a SHA-256 hash (never the raw token).
 */

import { Algorithm, hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";

// OWASP-recommended Argon2id parameters (19 MiB / 2 iterations / 1 lane).
const ARGON2_OPTIONS = {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
    return argon2Hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
    // Legacy bcrypt hashes from before the Argon2 switch.
    if (passwordHash.startsWith("$2")) {
        return bcrypt.compare(plain, passwordHash);
    }
    try {
        return await argon2Verify(passwordHash, plain);
    } catch {
        return false;
    }
}

/** Hash a raw refresh token for storage/lookup. The raw token is never persisted. */
export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}
