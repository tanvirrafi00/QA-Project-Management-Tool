/**
 * User-management routes — `/api/users`. Every route requires authentication; most require the
 * `user:manage` action (admin). Static routes (`/`, `/pending`, `/summary`) are declared before `/:id`.
 *
 * Member assignment writes to `user_project_assignments(project_id → projects.id)`. Projects are
 * SQL-backed at runtime (USE_DB_PROJECTS=true), so approval-time project assignment resolves cleanly.
 */

import { Router } from "express";
import { userController } from "../controllers/user.controller";
import { authenticate, authorize } from "../../../middleware/auth";

const router = Router();

router.use(authenticate); // all user management requires a valid session

// Static routes (must precede /:id).
router.get("/", authorize("user:manage"), userController.list);
router.get("/pending", authorize("user:manage"), userController.listPending);
router.get("/summary", authorize("user:manage"), userController.summary);
router.post("/", authorize("user:manage"), userController.create);

// Item routes.
router.get("/:id", authorize("user:manage"), userController.getById);
router.patch("/:id", authorize("user:manage"), userController.update);
router.patch("/:id/approve", authorize("user:manage"), userController.approve);
router.patch("/:id/reject", authorize("user:manage"), userController.reject);
router.patch("/:id/suspend", authorize("user:manage"), userController.suspend);
router.patch("/:id/activate", authorize("user:manage"), userController.activate);
router.delete("/:id", authorize("user:manage"), userController.deactivate);
router.post("/:id/assignments", authorize("project:assign"), userController.assignMember);

export default router;
