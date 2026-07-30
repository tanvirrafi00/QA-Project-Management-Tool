/**
 * Augment Express's Request with the authenticated principal. Populated by the `authenticate`
 * middleware; absent when auth is off (`AUTH_ENABLED=false`).
 */
import type { SessionUser } from "../shared/auth/session";

declare module "express-serve-static-core" {
    interface Request {
        user?: SessionUser;
    }
}
