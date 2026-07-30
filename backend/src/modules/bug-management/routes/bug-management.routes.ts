/**
 * Bug Management Routes
 * API endpoints for the bug management module.
 * Role gates (`maybeAuthorize`) are inert while AUTH_ENABLED=false; enforced once auth is on.
 * Project-scoped membership checks are deferred to the post-DB cutover (runbook gap #1).
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { bugManagementController } from '../controllers/bug-management.controller';
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

// Bug import — MUST be above `/:id` so the static paths win.
router.post('/import', maybeAuthorize('bug:create'), uploadXlsx, bugManagementController.importBugPreview); // Parse + validate XLSX → preview
router.post('/import/save', maybeAuthorize('bug:create'), bugManagementController.importBugSave);           // Persist validated preview

// Bug generation & management
router.post('/generate', maybeAuthorize('bug:create'), bugManagementController.generateBug);     // AI generate bug report
router.post('/save', maybeAuthorize('bug:create'), bugManagementController.saveBug);             // Save bug to repository
router.get('/', maybeAuthorize('report:view'), bugManagementController.listBugs);                 // List bugs with filters
router.get('/analytics', maybeAuthorize('report:view'), bugManagementController.getAnalytics);    // Dashboard analytics
router.get('/:id/history', maybeAuthorize('report:view'), bugManagementController.getBugHistory); // Get bug edit history
router.get('/:id', maybeAuthorize('report:view'), bugManagementController.getBug);                // Get single bug
router.patch('/:id', maybeAuthorize('bug:update'), bugManagementController.updateBug);            // Update bug (with change tracking)
router.delete('/:id', maybeAuthorize('bug:delete'), bugManagementController.deleteBug);           // Delete bug

export default router;
