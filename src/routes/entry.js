// routes/entry.js
// POST /entry/:id/delete — soft delete an entry

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Entry from '../models/Entry.js';

const router = Router();
router.use(requireAuth);

router.post('/:id/delete', async (req, res, next) => {
    try {
        const entry = await Entry.findByPk(req.params.id);
        if (entry) await entry.update({ deleted: 1 });
        res.redirect('/');
    } catch (err) {
        next(err);
    }
});

export default router;
