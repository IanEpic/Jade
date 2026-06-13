// routes/judgeEmail.js
// Equivalent of judgeEmail.cgi
// Admin-only POST: sends a judging-open email to selected judges.
// If the judge has no password yet, generates one and sets it first.

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import User           from '../models/User.js';
import UserCredential  from '../models/UserCredential.js';
import { mailHtml, parseSmtp } from '../services/mailer.js';
import { randomPassword, encryptPassword } from '../services/helpers.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = req.program;
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

            // Use UserCredential to determine if this judge already has a working login.
            // A judge added from another program will have a credential but no awareness
            // of their password in this program — check the credential, not User.password.
            const credential = judge.credentialid
                ? await UserCredential.findByPk(judge.credentialid)
                : await UserCredential.findOne({ where: { email: judge.email } });

            if (!credential || !credential.password) {
                const plain     = randomPassword();
                const encrypted = await encryptPassword(plain);
                if (credential) {
                    await credential.update({ password: encrypted });
                } else {
                    await UserCredential.create({ email: judge.email, password: encrypted });
                }
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
                ...parseSmtp(program.smtpserver),
            }).catch(err => console.warn(`Judge email failed for ${judge.email}:`, err.message));
        }

        return res.redirect('/home?action=emailjudges&sent=1');

    } catch (err) { next(err); }
});

export default router;
