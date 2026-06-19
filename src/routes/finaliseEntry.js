// routes/finaliseEntry.js
// Handles the finalise/un-finalise checkbox POST from viewEntry entrant panel.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Entry from '../models/Entry.js';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
    try {
        console.log('finaliseEntry POST headers:', JSON.stringify(req.headers));
        console.log('finaliseEntry POST body:', JSON.stringify(req.body));
        const user    = req.user;
        const entryid = req.body.entryid ? parseInt(req.body.entryid) : null;
        if (!entryid) return res.redirect('/home');

        const entry = await Entry.findByPk(entryid);
        if (!entry) return res.redirect('/home');

        // Only the entry owner or admin may finalise
        if (entry.userid !== user.userid && !user.admin) return res.redirect('/home');

        const finalised = req.body.finalise ? true : false;
        await entry.update({ finalised });

        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json({ ok: true, finalised });
        }
        return res.redirect('/home?action=entries');

    } catch (err) { next(err); }
});

export default router;
