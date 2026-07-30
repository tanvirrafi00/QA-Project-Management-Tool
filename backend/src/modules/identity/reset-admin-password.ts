/**
 * Reset the bootstrap admin's password — NON-DESTRUCTIVE.
 *
 * Updates only the admin's `passwordHash` (and bumps `version`/`updatedAt`) and revokes all existing
 * refresh tokens for that user so old sessions can't survive the change. Leaves every project, bug, and
 * test case untouched. Run via `npm run db:reset-admin-password`.
 *
 * Password source (first wins):
 *   1. CLI flag:  `npm run db:reset-admin-password -- --password=NewPass123`
 *   2. Env var:   `BOOTSTRAP_ADMIN_PASSWORD` (in `.env`)
 *
 * Target email: `BOOTSTRAP_ADMIN_EMAIL` env var, defaulting to `admin@qa-copilot.local`.
 *
 * If no admin exists at that email, the script exits with an error (use `npm run db:seed` to create one).
 */

import "dotenv/config";
import { closeDb, ensureDbInitialized } from "../../shared/db";
import { hashPassword } from "../../shared/auth";
import userRepository from "./repositories/user.repository";
import refreshTokenRepository from "./repositories/refresh-token.repository";

function parsePasswordArg(): string | undefined {
    const arg = process.argv.find((a) => a.startsWith("--password="));
    return arg?.split("=")[1];
}

async function main(): Promise<void> {
    // Standalone scripts must await the background DB init kicked off at import time — otherwise the
    // first repository call races `_db` while it's still null ("Database is not initialized").
    await ensureDbInitialized();

    const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@qa-copilot.local")
        .toLowerCase()
        .trim();
    const password = parsePasswordArg() || process.env.BOOTSTRAP_ADMIN_PASSWORD;

    if (!password) {
        console.error(
            "✗ No password provided. Set BOOTSTRAP_ADMIN_PASSWORD in .env or pass --password=<password>.",
        );
        console.error(
            "  Example: npm run db:reset-admin-password -- --password=Admin@12345",
        );
        process.exit(1);
    }

    const admin = await userRepository.findByEmail(email);
    if (!admin) {
        console.error(
            `✗ No user found for ${email}. Run \`npm run db:seed\` to create the bootstrap admin first.`,
        );
        process.exit(1);
    }
    if (admin.role !== "admin") {
        console.error(
            `✗ User ${email} exists but has role "${admin.role}", not "admin". Aborting.`,
        );
        process.exit(1);
    }

    const passwordHash = await hashPassword(password);

    // Optimistic-locked update — fetch the current version, then update. Retry once on conflict
    // (extremely unlikely for a maintenance script, but keeps it correct under contention).
    let updated = await userRepository.update(admin.id, admin.version, {
        passwordHash,
        updatedBy: admin.id,
    });
    if (!updated) {
        const fresh = await userRepository.findById(admin.id);
        if (!fresh) {
            console.error("✗ Admin user vanished mid-update. Aborting.");
            process.exit(1);
        }
        updated = await userRepository.update(fresh.id, fresh.version, {
            passwordHash,
            updatedBy: admin.id,
        });
    }
    if (!updated) {
        console.error("✗ Optimistic-lock conflict persisted after retry. Try again.");
        process.exit(1);
    }

    // Security: invalidate every existing refresh token so old sessions can't survive the change.
    await refreshTokenRepository.revokeAllForUser(admin.id);

    console.log("=".repeat(60));
    console.log("✓ Admin password updated (non-destructive — no business data touched).");
    console.log(`  email:    ${email}`);
    console.log(`  version:  ${updated.version}`);
    console.log("  All existing sessions have been revoked — please log in again.");
    console.log("=".repeat(60));

    await closeDb();
    process.exit(0);
}

main().catch((err) => {
    console.error("db:reset-admin-password failed:", err);
    process.exit(1);
});
