// routes/viewPage.js
// Equivalent of viewpage.cgi.
// Auth required. GET ?name=X — finds UserPage by programid + name, renders html.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import UserPage from '../models/UserPage.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
    try {
        const { name } = req.query;
        const program = req.user.program;

        if (!name) {
            return res.renderInShell('viewPage', { user: req.user, program, page: null });
        }

        const page = await UserPage.findOne({ where: { programid: program.programid, name } });

        return res.renderInShell('viewPage', { user: req.user, program, page: page ? page.toJSON() : null });
    } catch (err) { next(err); }
});

export default router;
