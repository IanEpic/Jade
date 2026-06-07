// routes/activate.js
// Handles email activation links: GET /{slug}/activate?token=...

import { Router } from 'express';
import UserCredential from '../models/UserCredential.js';

const router = Router();

router.get('/', async (req, res, next) => {
    try {
        const { token } = req.query;
        const program   = req.program;
        const loginUrl  = '/' + program.slug + '/login';

        if (!token) {
            return res.renderInShell('activate', {
                program, success: false,
                message: 'Invalid activation link.',
            }, { useLoginShell: true });
        }

        const credential = await UserCredential.findOne({ where: { activationtoken: token } });

        if (!credential) {
            return res.renderInShell('activate', {
                program, success: false,
                message: 'This activation link is invalid or has already been used.',
            }, { useLoginShell: true });
        }

        await credential.update({ activated: 1, activationtoken: null });

        // If they're already logged in (same session as signup), go straight home
        if (req.session?.userId) return res.redirect('/home');

        return res.renderInShell('activate', {
            program, success: true, loginUrl,
            message: 'Your account has been activated. You can now log in.',
        }, { useLoginShell: true });

    } catch (err) { next(err); }
});

export default router;
