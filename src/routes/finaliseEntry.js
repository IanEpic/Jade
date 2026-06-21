// routes/finaliseEntry.js
// Handles the finalise/un-finalise checkbox POST from viewEntry entrant panel.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Entry    from '../models/Entry.js';
import Category from '../models/Category.js';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const entryid = req.body.entryid ? parseInt(req.body.entryid) : null;
        if (!entryid) return res.redirect('/home');

        const entry = await Entry.findByPk(entryid);
        if (!entry) return res.redirect('/home');

        // Only the entry owner or admin may finalise
        if (entry.userid !== user.userid && !user.admin) return res.redirect('/home');

        // Entries must be open for the category or have a per-entry override (non-admin)
        if (!user.admin) {
            const category = await Category.findByPk(entry.categoryid);
            if (!category || (!category.entriesopen && !entry.entryopen)) {
                return res.redirect(`/viewEntry?entryid=${entryid}`);
            }
        }

        const finalised = req.body.finalise ? true : false;
        await entry.update({ finalised });

        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json({ ok: true, finalised });
        }
        return res.redirect('/home?action=entries');

    } catch (err) { next(err); }
});

export default router;
