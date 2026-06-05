// routes/rootLogin.js
// Platform-level login — not tied to a specific program.
// Verifies against UserCredential, then:
//   - 1 program  → complete session setup, redirect straight in
//   - 2+ programs → show program picker
//   - 0 programs  → error (no active program membership)

import { Router } from 'express';
import { login, getLinkedPrograms, recordLogon } from '../services/auth.js';
import User from '../models/User.js';

const router = Router();

// GET /login
router.get('/', (req, res) => {
    // Already fully logged in — go home
    if (req.session?.userId && req.session?.programSlug) {
        return res.redirect(`/${req.session.programSlug}/home`);
    }
    // Credential verified but program not yet chosen — show picker
    if (req.session?.credentialId && req.session?.linkedPrograms?.length) {
        return res.render('programPicker', { programs: req.session.linkedPrograms, error: null });
    }
    res.render('rootLogin', { error: null });
});

// POST /login
router.post('/', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.render('rootLogin', { error: 'Please enter your email and password.' });
        }

        // Verify credential without requiring a programId
        const { default: UserCredential } = await import('../models/UserCredential.js');
        const { checkPassword }           = await import('../services/helpers.js');

        const credential = await UserCredential.findOne({ where: { email } });
        if (!credential || !(await checkPassword(password, credential.password))) {
            return res.render('rootLogin', { error: 'Email address or password incorrect.' });
        }

        const programs = await getLinkedPrograms(credential.credentialid);
        if (!programs.length) {
            return res.render('rootLogin', { error: 'No active program memberships found for this account.' });
        }

        // Store credential + program list in session
        req.session.credentialId    = credential.credentialid;
        req.session.linkedPrograms  = programs;

        if (programs.length === 1) {
            // Single program — complete session and go straight in
            return completeLogin(req, res, next, credential.credentialid, programs[0]);
        }

        // Multiple programs — show picker
        req.session.save(err => {
            if (err) return next(err);
            res.render('programPicker', { programs, error: null });
        });

    } catch (err) { next(err); }
});

// POST /login/pick — user selected a program from the picker
router.post('/pick', async (req, res, next) => {
    try {
        const { slug } = req.body;
        if (!req.session?.credentialId) return res.redirect('/login');

        const programs = req.session.linkedPrograms || [];
        const chosen   = programs.find(p => p.slug === slug);
        if (!chosen) {
            return res.render('programPicker', { programs, error: 'Invalid selection — please try again.' });
        }

        return completeLogin(req, res, next, req.session.credentialId, chosen);
    } catch (err) { next(err); }
});

async function completeLogin(req, res, next, credentialId, program) {
    try {
        const user = await User.findOne({
            where: { credentialid: credentialId, programid: program.programid, deleted: 0, enabled: 1 },
        });
        if (!user) return res.redirect('/login');

        await recordLogon(user.userid);

        req.session.userId       = user.userid;
        req.session.programId    = program.programid;
        req.session.programSlug  = program.slug;
        req.session.credentialId = credentialId;

        req.session.save(err => {
            if (err) return next(err);
            res.redirect(`/${program.slug}/home`);
        });
    } catch (err) { next(err); }
}

export default router;
