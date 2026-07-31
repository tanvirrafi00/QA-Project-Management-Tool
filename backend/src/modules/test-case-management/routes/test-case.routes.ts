/**
 * Test Case Management Routes
 * API endpoints for the test case management module.
 * Role gates (`maybeAuthorize`) are inert while AUTH_ENABLED=false; enforced once auth is on.
 * Project-scoped membership checks are deferred to the post-DB cutover (runbook gap #1).
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { testCaseController } from '../controllers/test-case.controller';
import { maybeAuthorize } from '../../../middleware/auth';

const router = Router();

// XLSX upload config — memory storage (buffer handed to the parser), 10 MB cap, .xlsx-only filter.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const isXlsx =
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.originalname.toLowerCase().endsWith('.xlsx');
        if (!isXlsx) {
            return cb(new Error('Invalid file format. Please upload an .xlsx file only.'));
        }
        cb(null, true);
    },
});

/**
 * Wrap multer so size-limit / file-filter errors return a clean 400 envelope instead of falling
 * through to the global handler (which would 500 them).
 */
function uploadXlsx(req: Request, res: Response, next: NextFunction): void {
    upload.single('file')(req, res, (err: unknown) => {
        if (err) {
            const e = err as { code?: string; message?: string };
            const message =
                e?.code === 'LIMIT_FILE_SIZE'
                    ? 'File too large. Maximum allowed size is 10 MB.'
                    : e?.message || 'Invalid file upload.';
            res.status(400).json({ success: false, error: message, message });
            return;
        }
        next();
    });
}

// Test case management
router.post('/import', maybeAuthorize('testcase:create'), uploadXlsx, testCaseController.importTestCasePreview); // Parse + validate XLSX → preview
router.post('/import/save', maybeAuthorize('testcase:create'), testCaseController.importTestCaseSave);            // Persist validated preview
router.post('/paste', maybeAuthorize('testcase:create'), testCaseController.parsePaste); // Parse + validate pasted table → preview
router.post('/paste/save', maybeAuthorize('testcase:create'), testCaseController.savePaste); // Persist validated paste
router.post('/save', maybeAuthorize('testcase:create'), testCaseController.saveTestCase);             // Save single test case
router.post('/bulk-save', maybeAuthorize('testcase:create'), testCaseController.bulkSaveTestCases);    // Bulk save from generator
router.post('/quick-add', maybeAuthorize('testcase:create'), testCaseController.quickAddTestCase);    // Quick add single test case
router.get('/', maybeAuthorize('report:view'), testCaseController.listTestCases);                      // List with filters
router.get('/analytics', maybeAuthorize('report:view'), testCaseController.getAnalytics);              // Dashboard analytics
router.get('/modules', maybeAuthorize('report:view'), testCaseController.getModuleTree);               // Module tree navigation
router.delete('/modules', maybeAuthorize('testcase:delete'), testCaseController.deleteModule);         // Delete all cases in a module
router.patch('/bulk-update', maybeAuthorize('testcase:update'), testCaseController.bulkUpdateTestCases); // Bulk update status/assignee
router.get('/:id/history', maybeAuthorize('report:view'), testCaseController.getTestCaseHistory);     // Get edit history
router.get('/:id', maybeAuthorize('report:view'), testCaseController.getTestCase);                    // Get single test case
router.patch('/:id', maybeAuthorize('testcase:update'), testCaseController.updateTestCase);           // Update test case
router.delete('/:id', maybeAuthorize('testcase:delete'), testCaseController.deleteTestCase);          // Delete test case

export default router;
