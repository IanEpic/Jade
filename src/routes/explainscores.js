// routes/explainscores.js
// Equivalent of explainscores.cgi.
// Auth required. Renders program.scoresexplained inside the standard shell.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
    res.renderInShell('explainscores', {
        user:    req.user,
        program: req.user.program,
    });
});

export default router;
