/**
 * Auth routes — `/api/auth`. Register/login/refresh are public; logout + `/me` + `/profile` require
 * an access token (`authenticate`). Login + register are rate-limited to slow brute-force attempts.
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authController } from "../controllers/auth.controller";
import { authenticate } from "../../../middleware/auth";

const router = Router();

// Credential endpoints: 20 attempts / 15 min / IP.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many attempts. Please try again later." },
});

router.post("/register", authLimiter, authController.register);
router.post("/login", authLimiter, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authenticate, authController.logout);
router.get("/me", authenticate, authController.me);
router.get("/profile", authenticate, authController.me);
// Requestable roles for the registration dropdown (public — needed before login).
router.get("/roles", authController.roles);

export default router;
