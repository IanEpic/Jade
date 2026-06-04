// routes/feedback.js
// Equivalent of feedback.cgi
// POST only: records judge/entrant feedback and marks the user as having left feedback.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import User     from '../models/User.js';
import Feedback from '../models/Feedback.js';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
    try {
        const user = req.user;
        const body = req.body;

        await User.update({ feedbackleft: true }, { where: { userid: user.userid } });

        await Feedback.create({
            userid:        user.userid,
            communication: body.communication  || null,
            portal:        body.portal         || null,
            judges:        body.judges         || null,
            overall:       body.overall        || null,
            categories:    body.categories     || null,
            entry_process: body.entry_process  || null,
            enter_again:   body.enter_again    || null,
            improve:       body.improve        || null,
            testimonial:   body.testimonial    || null,
        });

        if (body.submit === 'Proceed to Finalist List') {
            return res.redirect('/home?action=finalists');
        }
        res.redirect('/home');

    } catch (err) { next(err); }
});

export default router;
