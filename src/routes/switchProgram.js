// routes/switchProgram.js
// Handles the program-switch confirmation prompt.
// No requireAuth — the user may not be fully "in" the target program yet.
// Requires session.userId (any logged-in state) and session.pendingSwitch.

import { Router } from 'express';
import { getLinkedPrograms } from '../services/auth.js';

const router = Router();

// GET /:slug/switch-confirm — show the "Switch to X?" prompt
router.get('/', (req, res, next) => {
    try {
        if (!req.session?.userId || !req.session.pendingSwitch) {
            return res.redirect('/login');
        }
        res.renderInShell('switchProgram', {
            program: req.program,
            pending: req.session.pendingSwitch,
        });
    } catch (err) {
        next(err);
    }
});

// POST /:slug/switch-confirm — confirm or cancel the switch
router.post('/', async (req, res, next) => {
    try {
        if (!req.session?.userId || !req.session.pendingSwitch) {
            return res.redirect('/login');
        }

        if (req.body.action === 'confirm') {
            const { userId, programId, programSlug } = req.session.pendingSwitch;
            req.session.userId        = userId;
            req.session.programId     = programId;
            req.session.programSlug   = programSlug;
            req.session.pendingSwitch = null;
            req.session.emulateUserId = null;
            // Refresh linkedPrograms in case anything changed
            if (req.session.credentialId) {
                req.session.linkedPrograms = await getLinkedPrograms(req.session.credentialId);
            }
            return req.session.save(err => {
                if (err) return next(err);
                res.redirectAbsolute(`/${programSlug}/home`);
            });
        }

        // Cancel — stay in the current program
        req.session.pendingSwitch = null;
        req.session.save(err => {
            if (err) return next(err);
            res.redirect('/home');
        });
    } catch (err) {
        next(err);
    }
});

export default router;
