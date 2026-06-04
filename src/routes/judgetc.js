// routes/judgetc.js
// Equivalent of judgetc.cgi
// Judge-only POST: records agreement to judge T&Cs.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import User from '../models/User.js';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
    try {
        const user = req.user;

        if (!user.judge) return res.redirect('/home');

        if (req.body.agree === 'ON') {
            await User.update({ judgetc: true }, { where: { userid: user.userid } });
            return res.redirect('/home?action=tojudge');
        } else {
            return res.redirect('/home?action=judgetcerror');
        }

    } catch (err) { next(err); }
});

export default router;
