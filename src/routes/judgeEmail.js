// routes/judgeEmail.js
// Equivalent of judgeEmail.cgi
// Admin-only POST: sends a judging-open email to selected judges.
// If the judge has no password yet, generates one and sets it first.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import User from '../models/User.js';
import { mailHtml } from '../services/mailer.js';
import { randomPassword, encryptPassword } from '../services/helpers.js';

const router = Router();
router.use(requireAuth);
router.use((req, res, next) => {
    if (!req.user.admin) return res.redirect('/home');
    next();
});

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;
        const body    = req.body;

        const judgeIds         = [].concat(body.judges || []).map(Number);
        const existingUserText = body.existinguseremail || '';
        const newUserText      = body.newuseremail      || '';
        const signoff          = `\n\nBest Regards,\n\nThe ${program.name} Team`;

        for (const judgeid of judgeIds) {
            const judge = await User.findByPk(judgeid);
            if (!judge) continue;

            const salutation = `Dear ${judge.firstname}\n\n`;
            let msg;

            if (!judge.password || judge.password === '') {
                const plain     = randomPassword();
                const encrypted = await encryptPassword(plain);
                await judge.update({ password: encrypted });
                const loginDetails = `\n\nemail:    ${judge.email}\npassword: ${plain}`;
                msg = salutation + newUserText + loginDetails + signoff;
            } else {
                msg = salutation + existingUserText + signoff;
            }

            mailHtml({
                to:      judge.email,
                subject: `${program.name} Judging Open`,
                html:    msg.replace(/\n/g, '<br>'),
                from:    program.emailfromaddress,
                smtpHost: program.smtpserver,
            }).catch(err => console.warn(`Judge email failed for ${judge.email}:`, err.message));
        }

        return res.redirect('/home');

    } catch (err) { next(err); }
});

export default router;
