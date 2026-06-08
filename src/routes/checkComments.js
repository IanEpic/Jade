// routes/checkComments.js
// AJAX endpoint — validates judge comments against program guidelines.
// Returns { ok: true } or { ok: false, feedback: '...' }

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import JudgingModel from '../models/JudgingModel.js';
import { checkComments } from '../services/commentCheck.js';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
    try {
        const program = req.program;
        if (!program?.judgingmodelid) return res.json({ ok: true });

        const jm = await JudgingModel.findByPk(program.judgingmodelid);
        if (!jm?.commentguidelines) return res.json({ ok: true });

        const { excel = '', improve = '', other = '' } = req.body;
        if (!excel && !improve && !other) return res.json({ ok: true });

        const feedback = await checkComments({ excel, improve, other, guidelines: jm.commentguidelines });
        if (feedback) return res.json({ ok: false, feedback });
        return res.json({ ok: true });

    } catch (err) { next(err); }
});

export default router;
