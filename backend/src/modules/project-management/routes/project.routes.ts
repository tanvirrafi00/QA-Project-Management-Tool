/**
 * Project Management Routes
 * API endpoints for the project management module
 *
 * Mounted at /api/projects. Role gates (`maybeAuthorize`) are inert while AUTH_ENABLED=false; once
 * auth is on they enforce RBAC per docs/rbac-design.md. Project-scoped membership checks
 * (scopeResolver) are deferred to the post-DB cutover (runbook gap #1) since membership is keyed by
 * project uuid + user_project_assignments.
 */

import { Router } from 'express';
import { projectController } from '../controllers/project.controller';
import { maybeAuthorize } from '../../../middleware/auth';

const router = Router();

// ── Collection endpoints ───────────────────────────────
router.post('/', maybeAuthorize('project:create'), projectController.createProject);       // Create (admin-only)
router.get('/', maybeAuthorize('report:view'), projectController.listProjects);            // List (search + filter)
router.get('/summary', maybeAuthorize('report:view'), projectController.getSummary);       // Dashboard summary cards
router.get('/active', maybeAuthorize('report:view'), projectController.listActive);        // Active projects (selector)

// ── Item endpoints ─────────────────────────────────────
// NOTE: /:id must come AFTER the static /summary and /active routes above.
router.get('/:id', maybeAuthorize('report:view'), projectController.getProject);           // Get single project
router.patch('/:id', maybeAuthorize('project:update'), projectController.updateProject);   // Update (code not editable)
router.patch('/:id/archive', maybeAuthorize('project:archive'), projectController.archiveProject);     // Archive (soft delete)
router.patch('/:id/restore', maybeAuthorize('project:update'), projectController.restoreProject);      // Restore archived project
router.get('/:id/delete-check', maybeAuthorize('project:delete'), projectController.getDeleteCheck);   // Pre-delete safety check
router.get('/:id/history', maybeAuthorize('report:view'), projectController.getHistory);   // Audit history
router.get('/:id/members', maybeAuthorize('report:view'), projectController.getMembers);   // Project members (Assignee dropdown)
router.delete('/:id', maybeAuthorize('project:delete'), projectController.deleteProject);  // Delete (guarded, ?force=true)

export default router;
