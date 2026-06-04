// routes/passwordReset.js
// Equivalent of resetPassword.cgi
// Public (no auth): 3-step password reset flow.
//   GET  /password-reset                → email entry form
//   POST /password-reset (email)        → if no question: reset & email immediately
//                                          if question: show security question form
//   POST /password-reset (userid+answer)→ verify answer, reset & email if correct

import { Router } from 'express';
import { randomPassword, encryptPassword } from '../services/helpers.js';
import { mail } from '../services/mailer.js';
import User from '../models/User.js';
import UserCredential from '../models/UserCredential.js';

const router = Router();

// req.program already set by resolveProgram middleware in program.js

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sendPasswordReset(user, program) {
    const newPassword = randomPassword();
    const hashed      = await encryptPassword(newPassword);

    // Update UserCredential if linked; fall back to User.password for pre-migration rows
    if (user.credentialid) {
        await UserCredential.update({ password: hashed }, { where: { credentialid: user.credentialid } });
    } else {
        await User.update({ password: hashed }, { where: { userid: user.userid } });
    }

    const text = `Dear ${user.firstname || user.email}
As you requested, we have reset your password to the random value shown below.

To log into the portal, please use the credentials below:

  email:    ${user.email}
  password: ${newPassword}

Please log in immediately and change your password by clicking "My Profile" on your home screen.
`;

    mail({
        to:      user.email,
        subject: `${program.name} Reset Password`,
        text,
        smtpHost: program.smtpserver || undefined,
        from:     program.emailfromaddress || undefined,
    }).catch(err => console.warn('Password reset email failed:', err.message));
}

// ── GET /password-reset ───────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        if (req.query.action === 'resetcomplete') {
            return res.renderInShell('passwordReset', { program: req.program, state: 'complete' }, { useLoginShell: true });
        }
        res.renderInShell('passwordReset', { program: req.program, state: 'blank', errors: [] }, { useLoginShell: true });
    } catch (err) { next(err); }
});

// ── POST /password-reset ──────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const program = req.program;
        const { email, userid, answer } = req.body;

        // Step 2: answer provided — verify and reset
        if (userid && answer) {
            const user = await User.findByPk(parseInt(userid));
            if (!user) return res.redirect('/password-reset');

            const dbAnswer      = (user.answer || '').replace(/\s+/g, '');
            const enteredAnswer = (answer       || '').replace(/\s+/g, '');

            if (dbAnswer.toLowerCase() !== enteredAnswer.toLowerCase()) {
                return res.renderInShell('passwordReset', {
                    program,
                    state:  'question',
                    user,
                    errors: ['Sorry, the answer was incorrect.'],
                }, { useLoginShell: true });
            }

            await sendPasswordReset(user, program);
            return res.redirect('/password-reset?action=resetcomplete');
        }

        // Step 1: email provided — look up user
        if (email) {
            const user = await User.findOne({
                where: { programid: program.programid, email, deleted: false },
            });

            if (!user || !user.enabled) {
                return res.renderInShell('passwordReset', {
                    program,
                    state:  'blank',
                    errors: ['Either we could not find a security question for this email or the account has been disabled.'],
                }, { useLoginShell: true });
            }

            // No security question — reset immediately
            if (!user.question || user.question.trim() === '') {
                await sendPasswordReset(user, program);
                return res.redirect('/password-reset?action=resetcomplete');
            }

            // Has a security question — show it
            return res.renderInShell('passwordReset', {
                program,
                state: 'question',
                user,
                errors: [],
            }, { useLoginShell: true });
        }

        // No params — show blank form
        res.renderInShell('passwordReset', { program, state: 'blank', errors: [] }, { useLoginShell: true });

    } catch (err) { next(err); }
});

export default router;
