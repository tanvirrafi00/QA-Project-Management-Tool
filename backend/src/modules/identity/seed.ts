/**
 * Bootstrap admin — the ONLY seeded account.
 *
 * `ensureBootstrapAdmin()` is idempotent: if any admin already exists it does nothing; otherwise it
 * creates one admin with a random password (or `BOOTSTRAP_ADMIN_PASSWORD`) and prints the credentials
 * once. Called at server boot (`index.ts`) and by `npm run db:seed`. No demo/lead/engineer users.
 *
 * The standalone `main()` (closeDb + exit) only runs when this file is executed directly
 * (`npm run db:seed`), not when imported — guarded by `require.main === module`.
 */

import { randomBytes } from "crypto";
import "dotenv/config";
import { closeDb, ensureDbInitialized } from "../../shared/db";
import { hashPassword } from "../../shared/auth";
import userRepository from "./repositories/user.repository";

export async function ensureBootstrapAdmin(): Promise<void> {
    const users = await userRepository.list();
    if (users.some((u) => u.role === "admin")) {
        return; // an admin already exists — nothing to do
    }

    const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@qa-copilot.local")
        .toLowerCase()
        .trim();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || randomBytes(24).toString("hex");

    await userRepository.create({
        email,
        name: "Bootstrap Admin",
        role: "admin",
        status: "active",
        passwordHash: await hashPassword(password),
    });

    console.log("=".repeat(60));
    console.log("Bootstrap admin created — store these credentials securely:");
    console.log(`  email:    ${email}`);
    console.log(`  password: ${password}`);
    console.log("(This message is shown only once, on creation.)");
    console.log("=".repeat(60));
}

async function main(): Promise<void> {
    // Standalone scripts must await the background DB init kicked off at import time — otherwise the
    // first repository call races `_db` while it's still null ("Database is not initialized").
    await ensureDbInitialized();
    await ensureBootstrapAdmin();
    await closeDb();
    process.exit(0);
}

// Run only when executed directly (npm run db:seed), not when imported by index.ts.
if (require.main === module) {
    main().catch((err) => {
        console.error("Bootstrap admin failed:", err);
        process.exit(1);
    });
}
