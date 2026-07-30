/**
 * Test Generation Routes
 * Defines API endpoints for the test generation module
 */

import { Router } from 'express';
import { testGenerationController } from '../controllers/test-generation.controller';
import { maybeAuthorize } from '../../../middleware/auth';

const router = Router();

/**
 * @route   POST /api/generate/test-cases
 * @desc    Generate test cases using multi-agent AI system
 * @access  Role-gated when AUTH_ENABLED=true (testcase:create); public otherwise.
 */
router.post('/test-cases', maybeAuthorize('testcase:create'), testGenerationController.generateTestCases);

/**
 * @route   POST /api/generate/test-cases/async
 * @desc    Create a generation job and return { jobId, status } immediately (Phase 6). Generation
 *          runs in the background; poll GET /api/generation-jobs/:id for progress + result.
 * @access  Role-gated when AUTH_ENABLED=true (testcase:create); public otherwise.
 */
router.post('/test-cases/async', maybeAuthorize('testcase:create'), testGenerationController.createGenerationJob);

/**
 * @route   GET /api/generate/config
 * @desc    Generation options (test types, coverage levels, modules) for the input form.
 * @access  Public — needed to render the form before login is required for generation.
 */
router.get('/config', testGenerationController.getConfig);

export default router;
