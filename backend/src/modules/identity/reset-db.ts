/**
 * DB reset (DESTRUCTIVE, dev-only). Truncates all business + user tables, then ensures a bootstrap
 * admin. Run via `npm run db:reset`. Leaves the system in the clean foundation state: zero business
 * data, exactly one (bootstrap) admin.
 */

import "dotenv/config";
import { closeDb, ensureDbInitialized, pool } from "../../shared/db";
import { ensureBootstrapAdmin } from "./seed";

const TABLES = [
    "test_case_bugs",
    "test_case_history",
    "bug_history",
    "project_history",
    "bugs",
    "test_cases",
    "projects",
    "activity_log",
    "generations",
    "reports",
    "refresh_tokens",
    "user_project_assignments",
    "users",
];

async function main(): Promise<void> {
    // Standalone scripts must await the background DB init kicked off at import time — otherwise the
    // first pool/repository call races `_pool`/`_db` while still null ("Database is not initialized").
    await ensureDbInitialized();
    console.log("⚠️  Resetting database (destructive)…");
    await pool.query(
        `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE;`,
    );
    console.log("Truncated all business + user tables.");
    await ensureBootstrapAdmin();
    console.log("Clean foundation ready.");
    await closeDb();
    process.exit(0);
}

main().catch((err) => {
    console.error("db:reset failed:", err);
    process.exit(1);
});
