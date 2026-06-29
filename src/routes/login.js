// routes/login.js

import { Router }                          from 'express';
import { login, recordLogon, getLinkedPrograms } from '../services/auth.js';
import User                                from '../models/User.js';
import UserCredential                      from '../models/UserCredential.js';
import { encryptPassword, randomPassword, PASSWORD_RULES } from '../services/helpers.js';
import crypto from 'crypto';
import { mail, parseSmtp }                 from '../services/mailer.js';

const router = Router();

// ── GET /login ────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { program } = req;

    if (!program.portalopen) {
      return res.renderInShell('login', {
        program, message: 'The Portal is Currently Closed for Maintenance', form: false,
      }, { useLoginShell: true });
    }

    // Only bounce to /home when the session belongs to THIS program. Otherwise (logged into a
    // different program, no access here) fall through and show the login page — without this guard,
    // requireAuth on /home redirects back to /login and the two ping-pong ("too many redirects").
    if (req.session.userId && req.session.programId === req.program.programid) return res.redirect('/home');

    if (req.query.action === 'change_email') {
      return res.renderInShell('login', {
        program,
        message: 'As you have changed your email address we have automatically reset your password. You will shortly receive an email containing your new password.',
        form: true,
      }, { useLoginShell: true });
    }
    if (req.query.action === 'change_password') {
      return res.renderInShell('login', {
        program, message: 'As you have changed your password, please log in again.', form: true,
      }, { useLoginShell: true });
    }

    res.renderInShell('login', { program, message: null, form: true, passwordRules: PASSWORD_RULES }, { useLoginShell: true });

  } catch (err) { next(err); }
});

// ── POST /check-email — AJAX step 1 ──────────────────────────────────────────

router.post('/check-email', async (req, res, next) => {
  try {
    const { program } = req;
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.json({ status: 'error', message: 'Please enter your email address.' });

    // Modern credential path
    const credential = await UserCredential.findOne({ where: { email } });

    if (credential) {
      let user = await User.findOne({
        where: { credentialid: credential.credentialid, programid: program.programid, deleted: 0 },
      });

      if (!user) {
        // Credential exists but no User record for this program — add them
        user = await addCredentialToProgram(credential, program);
        return res.json({ status: 'added', name: credential.firstname || user.firstname });
      }
      if (!user.enabled) return res.json({ status: 'disabled' });
      return res.json({ status: 'password', name: credential.firstname || user.firstname });
    }

    // No account at all
    return res.json({ status: 'signup' });

  } catch (err) { next(err); }
});

// ── POST /signup — AJAX inline registration ───────────────────────────────────

router.post('/signup', async (req, res, next) => {
  try {
    const { program } = req;
    const { email, firstname, lastname, mobile } = req.body;

    if (!email || !firstname || !lastname) {
      return res.json({ ok: false, error: 'Please fill in all required fields.' });
    }

    // Check again — someone else may have registered between steps
    const existingCredential = await UserCredential.findOne({ where: { email } });
    if (existingCredential) {
      return res.json({ ok: false, error: 'An account with this email address already exists. Please use the login form or reset your password.' });
    }

    const setupToken        = crypto.randomBytes(32).toString('hex');
    const tempPassword      = randomPassword();
    const encryptedPassword = await encryptPassword(tempPassword);

    const credential = await UserCredential.create({
      email,
      password:        encryptedPassword,
      activated:       1,
      activationtoken: setupToken,
      firstname:       firstname.trim(),
      lastname:        lastname.trim(),
      mobile:          (mobile || '').trim(),
      organisation:    '',
      telephone:       '',
    });

    const newUser = await User.create({
      programid:    program.programid,
      credentialid: credential.credentialid,
      email,
      password:     encryptedPassword,
      question:     '',
      answer:       '',
      paymentsopen: program.paymentsopendefault ? 1 : 0,
      enabled:      1,
      exclude:      0,
      deleted:      0,
      judge:        0,
      admin:        0,
    });

    const proto      = req.get('x-forwarded-proto') || req.protocol;
    const host       = req.get('x-forwarded-host')  || req.get('host');
    const setupUrl   = proto + '://' + host + '/' + program.slug + '/set-password?token=' + setupToken;

    mail({
      to:      email,
      subject: program.name + ' — Set Your Password',
      text:    'Dear ' + newUser.firstname + ',\n\n'
             + 'Thank you for registering with the ' + program.name + ' portal.\n\n'
             + 'Please click the link below to set your password:\n\n'
             + setupUrl + '\n\n'
             + 'If you did not register for this account, please ignore this email.\n',
      from:    program.emailfromaddress,
      ...parseSmtp(program.smtpserver),
    }).catch(err => console.warn('Welcome email failed:', err.message));

    // Log them straight in — no need to go through POST /login
    const { recordLogon, getLinkedPrograms } = await import('../services/auth.js');
    await recordLogon(newUser.userid);

    req.session.userId       = newUser.userid;
    req.session.programId    = program.programid;
    req.session.programSlug  = program.slug;
    req.session.credentialId = credential.credentialid;
    req.session.linkedPrograms = await getLinkedPrograms(credential.credentialid);

    await new Promise((resolve, reject) =>
      req.session.save(err => err ? reject(err) : resolve())
    );

    return res.json({ ok: true, redirect: '/' + program.slug + '/home' });

  } catch (err) { next(err); }
});

// ── POST /login ────────────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const { program } = req;
    const { email, password } = req.body;

    if (!program.portalopen) {
      return res.renderInShell('login', {
        program, message: 'The Portal is Currently Closed for Maintenance', form: false,
      }, { useLoginShell: true });
    }

    const result = await login(email, password, program.programid);

    if (!result) {
      return res.renderInShell('login', {
        program, message: null, form: true, passwordRules: PASSWORD_RULES,
        loginEmail: email,
        errors: ['The password you entered is incorrect. Please try again.'],
      }, { useLoginShell: true });
    }

    const { user, credential } = result;

    await recordLogon(user.userid);

    req.session.userId       = user.userid;
    req.session.programId    = program.programid;
    req.session.programSlug  = program.slug;
    req.session.credentialId = credential?.credentialid ?? null;

    if (credential) {
      req.session.linkedPrograms = await getLinkedPrograms(credential.credentialid);
    }

    if (req.body.emulateuser && user.admin) {
      req.session.emulateUserId = req.body.emulateuser;
    }

    const mustChange = credential?.mustchangepassword;

    req.session.save((err) => {
      if (err) return next(err);
      res.redirect(mustChange ? '/change-password' : '/home');
    });

  } catch (err) { next(err); }
});

// ── GET /logout ───────────────────────────────────────────────────────────────

router.get('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.redirect('/login');
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function addCredentialToProgram(credential, program) {
  return User.create({
    programid:    program.programid,
    credentialid: credential.credentialid,
    email:        credential.email,
    password:     credential.password,
    question:     '',
    answer:       '',
    paymentsopen: program.paymentsopendefault ? 1 : 0,
    enabled:      1,
    exclude:      0,
    deleted:      0,
    judge:        0,
    admin:        0,
  });
}

export default router;
