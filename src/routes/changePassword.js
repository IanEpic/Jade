// routes/changePassword.js
// Forces a password change when mustchangepassword is set on the credential.
// Also accessible voluntarily from My Profile.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { encryptPassword, validatePassword, PASSWORD_RULES } from '../services/helpers.js';
import UserCredential from '../models/UserCredential.js';
import User from '../models/User.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res, next) => {
    try {
        res.renderInShell('changePassword', {
            program: req.program,
            passwordRules: PASSWORD_RULES,
            errors:  [],
        }, { useLoginShell: true });
    } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try {
        const { password, password2 } = req.body;
        const program = req.program;

        const errors = [];
        const complexityError = validatePassword(password);
        if (complexityError)        errors.push(complexityError);
        if (password !== password2) errors.push('Passwords do not match.');

        if (errors.length) {
            return res.renderInShell('changePassword', { program, passwordRules: PASSWORD_RULES, errors }, { useLoginShell: true });
        }

        const hashed = await encryptPassword(password);
        const credentialId = req.session.credentialId;

        if (credentialId) {
            await UserCredential.update(
                { password: hashed, mustchangepassword: 0, activationtoken: null },
                { where: { credentialid: credentialId } },
            );
        } else {
            // Legacy user with no credential row — update User.password directly
            await User.update({ password: hashed }, { where: { userid: req.session.userId } });
        }

        res.redirect('/home');

    } catch (err) { next(err); }
});

export default router;
