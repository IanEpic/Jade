// routes/register.js
// Equivalent of formUser.cgi $form_blank — public new user registration.
// No session required. Creates user + address, sends welcome email, redirects to login.

import { Router }                       from 'express';
import User                             from '../models/User.js';
import Address                          from '../models/Address.js';
import { getProgramByHost }             from '../services/auth.js';
import { encryptPassword, randomPassword } from '../services/helpers.js';
import { mail }                         from '../services/mailer.js';

const router = Router();

// Redirect already-logged-in non-admin users away
// req.user not available here (no requireAuth), so load user from session manually
router.use(async (req, res, next) => {
    if (!req.session?.userId) return next();
    try {
        const User = (await import('../models/User.js')).default;
        const sessionUser = await User.findByPk(req.session.userId);
        if (sessionUser?.admin) return next();
        return res.redirect('/home');
    } catch (err) { next(err); }
});

// ── GET /register ─────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const program = await getProgramByHost(req.hostname);
        const isAdmin = !!req.session?.userId;
        res.renderInShell('register', { program, error: null, body: {}, isAdmin }, { useLoginShell: true });
    } catch (err) { next(err); }
});

// ── POST /register ────────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const program = await getProgramByHost(req.hostname);
        const body    = req.body;

        const isAdmin = !!req.session?.userId;
        const renderError = (msg) => res.renderInShell('register', {
            program, error: msg, body, isAdmin,
        }, { useLoginShell: true });

        // Required field validation — security question not required for admin-created users
        const required = ['email','firstname','lastname','address','city','state','code','country','mobile'];
        if (!isAdmin) required.push('question', 'answer');
        const missing = required.filter(f => !body[f]?.trim());
        if (missing.length) {
            return renderError('All fields are required. Please complete the form.');
        }
        if (!isAdmin && !body.tc) {
            return renderError('You must accept the terms and conditions to register.');
        }

        // Duplicate email check
        const existing = await User.findOne({
            where: { programid: program.programid, email: body.email.trim(), deleted: false }
        });
        if (existing) {
            return renderError('An account with this email address already exists. Use the password reset function if you have forgotten your password.');
        }

        // Create address first (userid set after user created)
        const newAddress = await Address.create({
            userid:  0, // temporary — updated below
            address: body.address.trim(),
            city:    body.city.trim(),
            state:   body.state.trim(),
            code:    body.code.trim(),
            country: body.country.trim(),
        });

        // Generate password
        const password          = randomPassword();
        const encryptedPassword = await encryptPassword(password);

        // Create user
        const newUser = await User.create({
            programid:       program.programid,
            email:           body.email.trim(),
            password:        encryptedPassword,
            question:        body.question?.trim() || '',
            answer:          body.answer?.trim() || '',
            firstname:       body.firstname.trim(),
            lastname:        body.lastname.trim(),
            organisation:    body.organisation?.trim() || '',
            postaladdressid: newAddress.addressid,
            telephone:       body.telephone?.trim() || '',
            mobile:          body.mobile.trim(),
            paymentsopen:    program.paymentsopendefault ? 1 : 0,
            judge:           isAdmin && body.isjudge ? 1 : 0,
            admin:           isAdmin && body.isadmin ? 1 : 0,
            enabled:         1,
            exclude:         0,
            deleted:         0,
        });

        // Link address back to user
        await newAddress.update({ userid: newUser.userid });

        // Send welcome email
        await mail({
            to:       newUser.email,
            subject:  `${program.name} — Your Login Details`,
            text:     `Dear ${newUser.firstname},\n\nThank you for registering with the ${program.name} portal.\n\nYour login details are:\n\nEmail:    ${newUser.email}\nPassword: ${password}\n\nPlease log in immediately and change your password by clicking "My Profile" on your home screen.\n`,
            from:     program.emailfromaddress,
            smtpHost: program.smtpserver,
        });

        // Admins go back to user list, new registrants see success page
        if (req.user?.admin) return res.redirect('/home?action=users');

        res.renderInShell('register', {
            program, error: null, body: {}, success: true,
        }, { useLoginShell: true });

    } catch (err) { next(err); }
});

export default router;
