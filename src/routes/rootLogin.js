// routes/rootLogin.js
// Platform-level login — not tied to a specific program.
// Two-step flow: email check (AJAX) → password → program picker (if >1 program).
// After login, mustchangepassword redirects to the slug-based change-password page.

import { Router } from 'express';
import { getLinkedPrograms, recordLogon } from '../services/auth.js';
import { checkPassword, encryptPassword, randomPassword, validatePassword, PASSWORD_RULES } from '../services/helpers.js';
import { mail } from '../services/mailer.js';
import User from '../models/User.js';
import UserCredential from '../models/UserCredential.js';

const router = Router();

const CHECK_URL  = '/login/check-email';
const RESET_URL  = '/login/reset';
const PICK_URL   = '/login/pick';
const LOGIN_URL  = '/login';

// ── GET /login ────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
    if (req.session?.userId && req.session?.programSlug) {
        return res.redirect(`/${req.session.programSlug}/home`);
    }
    if (req.session?.credentialId && req.session?.linkedPrograms?.length) {
        return res.render('programPicker', { programs: req.session.linkedPrograms, error: null });
    }
    res.render('rootLogin', {
        checkUrl: CHECK_URL, loginUrl: LOGIN_URL, resetUrl: RESET_URL,
        errors: [], loginEmail: '',
    });
});

// ── POST /login/check-email — AJAX step 1 ─────────────────────────────────────

router.post('/check-email', async (req, res, next) => {
    try {
        const email = (req.body.email || '').trim().toLowerCase();
        if (!email) return res.json({ status: 'error', message: 'Please enter your email address.' });

        const credential = await UserCredential.findOne({ where: { email } });
        if (!credential) return res.json({ status: 'notfound' });

        const hasPrograms = await User.findOne({
            where: { credentialid: credential.credentialid, deleted: 0, enabled: 1 },
        });
        if (!hasPrograms) return res.json({ status: 'notfound' });

        return res.json({ status: 'password', name: hasPrograms.firstname });

    } catch (err) { next(err); }
});

// ── POST /login ────────────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const renderError = (msg) => res.render('rootLogin', {
            checkUrl: CHECK_URL, loginUrl: LOGIN_URL, resetUrl: RESET_URL,
            errors: [msg], loginEmail: email || '',
        });

        if (!email || !password) return renderError('Please enter your email and password.');

        const credential = await UserCredential.findOne({ where: { email } });
        if (!credential || !(await checkPassword(password, credential.password))) {
            return renderError('The password you entered is incorrect. Please try again.');
        }

        if (!credential.activated) {
            return renderError('Please activate your account by clicking the link in the email we sent you when you registered.');
        }

        const programs = await getLinkedPrograms(credential.credentialid);
        if (!programs.length) {
            return renderError('No active program memberships found for this account.');
        }

        req.session.credentialId   = credential.credentialid;
        req.session.linkedPrograms = programs;

        if (credential.mustchangepassword) {
            return req.session.save(err => {
                if (err) return next(err);
                res.redirect('/login/change-password');
            });
        }

        if (programs.length === 1) {
            return completeLogin(req, res, next, credential, programs[0]);
        }

        req.session.save(err => {
            if (err) return next(err);
            res.render('programPicker', { programs, error: null });
        });

    } catch (err) { next(err); }
});

// ── POST /login/pick — program picker ────────────────────────────────────────

router.post('/pick', async (req, res, next) => {
    try {
        const { slug } = req.body;
        if (!req.session?.credentialId) return res.redirect('/login');

        const programs = req.session.linkedPrograms || [];
        const chosen   = programs.find(p => p.slug === slug);
        if (!chosen) {
            return res.render('programPicker', { programs, error: 'Invalid selection — please try again.' });
        }

        const credential = await UserCredential.findByPk(req.session.credentialId);
        return completeLogin(req, res, next, credential, chosen);

    } catch (err) { next(err); }
});

// ── GET /login/change-password ────────────────────────────────────────────────

router.get('/change-password', (req, res, next) => {
    try {
        if (!req.session?.credentialId) return res.redirect('/login');
        res.render('rootChangePassword', { passwordRules: PASSWORD_RULES, errors: [] });
    } catch (err) { next(err); }
});

// ── POST /login/change-password ───────────────────────────────────────────────

router.post('/change-password', async (req, res, next) => {
    try {
        if (!req.session?.credentialId) return res.redirect('/login');

        const { password, password2 } = req.body;
        const errors = [];
        const complexityError = validatePassword(password);
        if (complexityError)        errors.push(complexityError);
        if (password !== password2) errors.push('Passwords do not match.');

        if (errors.length) {
            return res.render('rootChangePassword', { passwordRules: PASSWORD_RULES, errors });
        }

        const hashed = await encryptPassword(password);
        await UserCredential.update(
            { password: hashed, mustchangepassword: 0 },
            { where: { credentialid: req.session.credentialId } },
        );

        const credential = await UserCredential.findByPk(req.session.credentialId);
        const programs   = req.session.linkedPrograms || [];

        if (programs.length === 1) {
            return completeLogin(req, res, next, credential, programs[0]);
        }

        req.session.save(err => {
            if (err) return next(err);
            res.render('programPicker', { programs, error: null });
        });

    } catch (err) { next(err); }
});

// ── GET /login/reset ──────────────────────────────────────────────────────────

router.get('/reset', (req, res) => {
    res.render('rootPasswordReset', {
        state: 'blank', email: (req.query.email || '').trim(),
        loginUrl: LOGIN_URL, resetUrl: RESET_URL, errors: [],
    });
});

// ── POST /login/reset ─────────────────────────────────────────────────────────

router.post('/reset', async (req, res, next) => {
    try {
        const email = (req.body.email || '').trim().toLowerCase();

        const renderBlank = (errors) => res.render('rootPasswordReset', {
            state: 'blank', email, loginUrl: LOGIN_URL, resetUrl: RESET_URL, errors,
        });

        if (!email) return renderBlank(['Please enter your email address.']);

        const credential = await UserCredential.findOne({ where: { email } });
        const user = credential && await User.findOne({
            where: { credentialid: credential.credentialid, deleted: 0, enabled: 1 },
            order: [['userid', 'ASC']],
        });

        // Always show "sent" — don't reveal whether the email exists
        if (credential && user) {
            const tempPassword = randomPassword();
            const hashed       = await encryptPassword(tempPassword);
            await UserCredential.update(
                { password: hashed, mustchangepassword: 1 },
                { where: { credentialid: credential.credentialid } },
            );

            mail({
                to:      email,
                subject: 'JADE Awards — Password Reset',
                text:    'Dear ' + (user.firstname || email) + ',\n\n'
                       + 'As requested, we have reset your password.\n\n'
                       + 'Your temporary login details are:\n\n'
                       + '  Email:    ' + email + '\n'
                       + '  Password: ' + tempPassword + '\n\n'
                       + 'Please log in immediately and change your password.\n\n'
                       + 'If you did not request this reset, please contact the administrator.\n',
            }).catch(err => console.warn('Root password reset email failed:', err.message));
        }

        res.render('rootPasswordReset', {
            state: 'sent', email, loginUrl: LOGIN_URL, resetUrl: RESET_URL, errors: [],
        });

    } catch (err) { next(err); }
});

// ── Helper ────────────────────────────────────────────────────────────────────

async function completeLogin(req, res, next, credential, program) {
    try {
        const user = await User.findOne({
            where: { credentialid: credential.credentialid, programid: program.programid, deleted: 0, enabled: 1 },
        });
        if (!user) return res.redirect('/login');

        await recordLogon(user.userid);

        req.session.userId      = user.userid;
        req.session.programId   = program.programid;
        req.session.programSlug = program.slug;
        req.session.credentialId = credential.credentialid;

        const mustChange = credential.mustchangepassword;

        req.session.save(err => {
            if (err) return next(err);
            res.redirect(mustChange ? `/${program.slug}/change-password` : `/${program.slug}/home`);
        });
    } catch (err) { next(err); }
}

export default router;
