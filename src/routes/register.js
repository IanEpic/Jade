// routes/register.js
// Equivalent of formUser.cgi $form_blank — public new user registration.
// No session required. Creates user + address, sends welcome email, redirects to login.

import { Router }                       from 'express';
import User                             from '../models/User.js';
import UserCredential                   from '../models/UserCredential.js';
import Address                          from '../models/Address.js';
import { encryptPassword, randomPassword } from '../services/helpers.js';
import { mail, parseSmtp }              from '../services/mailer.js';
import crypto                           from 'crypto';

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
        const program = req.program;
        const isAdmin = !!req.session?.userId;
        res.renderInShell('register', { program, error: null, body: {}, isAdmin }, { useLoginShell: true });
    } catch (err) { next(err); }
});

// ── POST /register ────────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const program = req.program;
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

        // Generate a temp password and a setup token for the welcome email link.
        const password          = randomPassword();
        const encryptedPassword = await encryptPassword(password);
        const setupToken        = crypto.randomBytes(32).toString('hex');

        // Find or create a UserCredential for this email.
        // If the person is already in another program, reuse their existing credential.
        let [credential, credentialCreated] = await UserCredential.findOrCreate({
            where:    { email: body.email.trim() },
            defaults: {
                email:        body.email.trim(),
                password:     encryptedPassword,
                activationtoken: setupToken,
                firstname:    body.firstname.trim(),
                lastname:     body.lastname.trim(),
                organisation: body.organisation?.trim() || '',
                telephone:    body.telephone?.trim()    || '',
                mobile:       body.mobile.trim(),
            },
        });
        // If credential already existed, update profile + attach a fresh setup token.
        if (!credentialCreated) {
            await credential.update({
                activationtoken: setupToken,
                firstname:    body.firstname.trim(),
                lastname:     body.lastname.trim(),
                organisation: body.organisation?.trim() || '',
                telephone:    body.telephone?.trim()    || '',
                mobile:       body.mobile.trim(),
            });
        }

        // Create user first (address needs a valid userid due to FK constraint)
        const newUser = await User.create({
            programid:       program.programid,
            credentialid:    credential.credentialid,
            email:           body.email.trim(),
            password:        encryptedPassword,
            question:        body.question?.trim() || '',
            answer:          body.answer?.trim() || '',
            postaladdressid: null, // set after address is created
            paymentsopen:    program.paymentsopendefault ? 1 : 0,
            judge:           isAdmin && body.isjudge ? 1 : 0,
            admin:           isAdmin && body.isadmin ? 1 : 0,
            enabled:         1,
            exclude:         0,
            deleted:         0,
        });

        // Create address linked to the new user
        const newAddress = await Address.create({
            userid:  newUser.userid,
            address: body.address.trim(),
            city:    body.city.trim(),
            state:   body.state.trim(),
            code:    body.code.trim(),
            country: body.country.trim(),
        });

        // Link address back to user
        await newUser.update({ postaladdressid: newAddress.addressid });

        // Fire-and-forget — don't block the response on email delivery
        const proto    = req.get('x-forwarded-proto') || req.protocol;
        const host     = req.get('x-forwarded-host')  || req.get('host');
        const setupUrl = `${proto}://${host}/${program.slug}/set-password?token=${setupToken}`;
        mail({
            to:       newUser.email,
            subject:  `${program.name} — Set Your Password`,
            text:     `Dear ${newUser.firstname},\n\nThank you for registering with the ${program.name} portal.\n\nPlease click the link below to set your password:\n\n${setupUrl}\n\nIf you did not register for this account, please ignore this email.\n`,
            from:     program.emailfromaddress,
            ...parseSmtp(program.smtpserver),
        }).catch(err => console.warn('Welcome email failed:', err.message));

        // Admins go back to user list, new registrants see success page
        if (isAdmin) return res.redirect('/home?action=users');

        res.renderInShell('register', {
            program, error: null, body: {}, success: true,
        }, { useLoginShell: true });

    } catch (err) { next(err); }
});

export default router;
