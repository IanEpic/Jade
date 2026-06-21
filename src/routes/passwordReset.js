// routes/passwordReset.js
// Public (no auth): simple password reset — enter email, receive temp password.
// Security question step removed in favour of email-based reset only.

import { Router } from 'express';
import { randomPassword, encryptPassword } from '../services/helpers.js';
import { mail, parseSmtp } from '../services/mailer.js';
import User from '../models/User.js';
import UserCredential from '../models/UserCredential.js';

const router = Router();

// ── GET /password-reset ───────────────────────────────────────────────────────

router.get('/', (req, res, next) => {
    try {
        res.renderInShell('passwordReset', {
            program: req.program,
            state:   'blank',
            email:   (req.query.email || '').trim(),
            errors:  [],
        }, { useLoginShell: true });
    } catch (err) { next(err); }
});

// ── POST /password-reset ──────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const program = req.program;
        const email   = (req.body.email || '').trim().toLowerCase();

        if (!email) {
            return res.renderInShell('passwordReset', {
                program, state: 'blank', errors: ['Please enter your email address.'],
            }, { useLoginShell: true });
        }

        const credential = await UserCredential.findOne({ where: { email } });
        const user = credential ? await User.findOne({
            where: { programid: program.programid, credentialid: credential.credentialid, deleted: 0 },
        }) : null;

        if (!user || !user.enabled) {
            // Don't reveal whether the email exists — just show the same success screen
            return res.renderInShell('passwordReset', {
                program, state: 'sent', email,
            }, { useLoginShell: true });
        }

        // Generate temp password and update credential
        const tempPassword = randomPassword();
        const hashed       = await encryptPassword(tempPassword);

        await UserCredential.update(
            { password: hashed, mustchangepassword: 1 },
            { where: { credentialid: credential.credentialid } },
        );

        mail({
            to:       email,
            subject:  program.name + ' — Password Reset',
            text:     'Dear ' + (credential.firstname || email) + ',\n\n'
                    + 'As requested, we have reset your password.\n\n'
                    + 'Your temporary login details are:\n\n'
                    + '  Email:    ' + email + '\n'
                    + '  Password: ' + tempPassword + '\n\n'
                    + 'Please log in immediately and change your password via My Profile.\n\n'
                    + 'If you did not request this reset, please contact the program administrator.\n',
            ...parseSmtp(program.smtpserver),
            from:     program.emailfromaddress || undefined,
        }).catch(err => console.warn('Password reset email failed:', err.message));

        return res.renderInShell('passwordReset', {
            program, state: 'sent', email,
        }, { useLoginShell: true });

    } catch (err) { next(err); }
});

export default router;
