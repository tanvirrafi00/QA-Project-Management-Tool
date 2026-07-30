/**
 * Project Estimation Routes
 * Mounted at /api/estimations. Role gates (`maybeAuthorize`) are inert while AUTH_ENABLED=false; once
 * auth is on they enforce RBAC per the estimation:* actions (see shared/auth/actions.ts). Owner-only
 * edit rules are enforced in the service layer (the action gate is coarse/defense-in-depth).
 *
 * Phase 1 = CRUD + computed summary. The approval workflow (submit/approve/reject/request-revision/
 * resubmit/select-final/comparisons/review-queue) lands in Phase 2.
 */

import { Router } from 'express';
import { estimationController } from '../controllers/estimation.controller';
import { maybeAuthorize } from '../../../middleware/auth';

const router = Router();

// ── Versions ──────────────────────────────────────────
router.post('/projects/:projectId/versions', maybeAuthorize('estimation:create'), estimationController.createVersion);
router.get('/projects/:projectId/versions', maybeAuthorize('estimation:read'), estimationController.listVersions);

// ── Modules ───────────────────────────────────────────
router.post('/projects/:projectId/modules', maybeAuthorize('estimation:create'), estimationController.createModule);
router.get('/projects/:projectId/modules', maybeAuthorize('estimation:read'), estimationController.listModules);

// ── Assignments ───────────────────────────────────────
router.post('/modules/:moduleId/assignments', maybeAuthorize('estimation:assign'), estimationController.createAssignment);
router.get('/modules/:moduleId/assignments', maybeAuthorize('estimation:read'), estimationController.listAssignments);

// ── Estimations ───────────────────────────────────────
// Static sub-paths of /estimations/:id must be declared before /estimations/:id.
router.get('/estimations/:id/history', maybeAuthorize('estimation:read'), estimationController.getHistory);
router.get('/estimations/:id/review-history', maybeAuthorize('estimation:read'), estimationController.getReviewEvents);

router.post('/modules/:moduleId/estimations', maybeAuthorize('estimation:create'), estimationController.createEstimation);
router.get('/estimations/:id', maybeAuthorize('estimation:read'), estimationController.getEstimation);
router.patch('/estimations/:id', maybeAuthorize('estimation:update'), estimationController.updateEstimation);
router.get('/projects/:projectId/estimations', maybeAuthorize('estimation:read'), estimationController.listEstimations);

// ── Approval workflow ─────────────────────────────────
router.post('/estimations/:id/submit', maybeAuthorize('estimation:submit'), estimationController.submit);
router.post('/estimations/:id/resubmit', maybeAuthorize('estimation:submit'), estimationController.resubmit);
router.post('/estimations/:id/approve', maybeAuthorize('estimation:approve'), estimationController.approve);
router.post('/estimations/:id/request-revision', maybeAuthorize('estimation:review'), estimationController.requestRevision);
router.post('/estimations/:id/reject', maybeAuthorize('estimation:review'), estimationController.reject);
router.post('/estimations/:id/reopen', maybeAuthorize('estimation:review'), estimationController.reopen);
router.post('/estimations/:id/select-final', maybeAuthorize('estimation:approve'), estimationController.selectFinal);
router.get('/modules/:moduleId/comparisons', maybeAuthorize('estimation:read'), estimationController.getComparisons);

// ── Computed summary, workload & review queue ─────────
router.get('/projects/:projectId/summary', maybeAuthorize('estimation:read'), estimationController.getSummary);
router.get('/projects/:projectId/engineers', maybeAuthorize('estimation:read'), estimationController.getEngineerWorkloads);
router.get('/projects/:projectId/capacity', maybeAuthorize('estimation:read'), estimationController.getCapacity);
router.get('/projects/:projectId/review-queue', maybeAuthorize('estimation:review'), estimationController.getReviewQueue);

export default router;
