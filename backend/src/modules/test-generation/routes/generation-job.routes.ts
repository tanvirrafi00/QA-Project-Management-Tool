/**
 * Generation Job Routes — Phase 6 (job-based processing).
 * Mounted at /api/generation-jobs. Poll status/progress/result, or request cancellation.
 */

import { Router } from 'express';
import { testGenerationController } from '../controllers/test-generation.controller';
import { maybeAuthorize } from '../../../middleware/auth';

const router = Router();

/**
 * @route   GET /api/generation-jobs/metrics
 * @desc    Phase 8 measure-first — concurrency counters (active/peak/total + terminal) for the
 *          in-memory job model. The signal for when Redis/queue workers are warranted (ADR-011).
 *          Registered before `/:id` so the dynamic segment doesn't capture "metrics".
 * @access  Role-gated when AUTH_ENABLED=true (testcase:create); public otherwise.
 */
router.get('/metrics', maybeAuthorize('testcase:create'), testGenerationController.getJobMetrics);

/**
 * @route   GET /api/generation-jobs/:id/events
 * @desc    Phase 7 — Server-Sent Events stream of live job snapshots (status + progress + result).
 *          Pushes an update on every phase boundary + terminal change; closes on terminal/disconnect.
 * @access  Role-gated when AUTH_ENABLED=true (testcase:create); public otherwise.
 */
router.get('/:id/events', maybeAuthorize('testcase:create'), testGenerationController.streamGenerationJob);

/**
 * @route   GET /api/generation-jobs/:id
 * @desc    Poll a generation job: status + progress, plus the full result when COMPLETED.
 * @access  Role-gated when AUTH_ENABLED=true (testcase:create); public otherwise.
 */
router.get('/:id', maybeAuthorize('testcase:create'), testGenerationController.getGenerationJob);

/**
 * @route   POST /api/generation-jobs/:id/cancel
 * @desc    Request cancellation of an in-flight generation job (best-effort, between phases).
 * @access  Role-gated when AUTH_ENABLED=true (testcase:create); public otherwise.
 */
router.post('/:id/cancel', maybeAuthorize('testcase:create'), testGenerationController.cancelGenerationJob);

export default router;
