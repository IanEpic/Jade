// routes/setPassword.js
// Public: token-based password setup for new accounts.
// Token is stored in UserCredential.activationtoken; cleared on success.

import { Router } from 'express';
import { encryptPassword, validatePassword, PASSWORD_RULES } from '../services/helpers.js';
import UserCredential from '../models/UserCredential.js';

const router = Router();

router.get('/', async (req, res, next) => {
    try {
        const { token } = req.query;
        const program   = req.program;

        if (!token) {
            return res.renderInShell('setPassword', {
                program, token: null, passwordRules: PASSWORD_RULES, errors: [],
                message: 'Invalid or missing setup link. Please contact the program administrator.',
            }, { useLoginShell: true });
        }

        const credential = await UserCredential.findOne({ where: { activationtoken: token } });
        if (!credential) {
            return res.renderInShell('setPassword', {
                program, token: null, passwordRules: PASSWORD_RULES, errors: [],
                message: 'This setup link is invalid or has already been used. If you need a new link, please contact the program administrator.',
            }, { useLoginShell: true });
        }

        return res.renderInShell('setPassword', {
            program, token, passwordRules: PASSWORD_RULES, errors: [], message: null,
        }, { useLoginShell: true });

    } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try {
        const { token, password, password2 } = req.body;
        const program = req.program;

        const renderError = (errors, tok) => res.renderInShell('setPassword', {
            program, token: tok || null, passwordRules: PASSWORD_RULES, errors, message: null,
        }, { useLoginShell: true });

        if (!token) return renderError(['Invalid setup link.'], null);

        const credential = await UserCredential.findOne({ where: { activationtoken: token } });
        if (!credential) {
            return renderError(['This setup link has already been used or is invalid. Please contact the program administrator.'], null);
        }

        const errors = [];
        const complexityError = validatePassword(password);
        if (complexityError)        errors.push(complexityError);
        if (password !== password2) errors.push('Passwords do not match.');
        if (errors.length) return renderError(errors, token);

        const hashed = await encryptPassword(password);
        await credential.update({ password: hashed, activationtoken: null, activated: 1 });

        return res.renderInShell('setPassword', {
            program, token: null, passwordRules: PASSWORD_RULES, errors: [],
            message: 'done',
        }, { useLoginShell: true });

    } catch (err) { next(err); }
});

export default router;
