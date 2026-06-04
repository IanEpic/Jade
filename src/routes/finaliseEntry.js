// routes/finaliseEntry.js
// Handles the finalise/un-finalise checkbox POST from viewEntry entrant panel.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Entry from '../models/Entry.js';

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

        const finalised = req.body.finalise ? true : false;
        await entry.update({ finalised });

        return res.redirect(`/viewEntry?entryid=${entryid}`);

    } catch (err) { next(err); }
});

export default router;
