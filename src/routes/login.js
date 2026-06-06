// routes/login.js

import { Router }                          from 'express';
import { login, recordLogon, getLinkedPrograms } from '../services/auth.js';
import User                                from '../models/User.js';
import UserCredential                      from '../models/UserCredential.js';
import { encryptPassword, randomPassword } from '../services/helpers.js';
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

    if (req.session.userId) return res.redirect('/home');

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

    res.renderInShell('login', { program, message: null, form: true }, { useLoginShell: true });

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
        return res.json({ status: 'added', name: user.firstname });
      }
      if (!user.enabled) return res.json({ status: 'disabled' });
      return res.json({ status: 'password', name: user.firstname });
    }

    // Legacy fallback: password stored on User row
    const legacyUser = await User.findOne({
      where: { email, programid: program.programid, deleted: 0 },
    });
    if (legacyUser) {
      if (!legacyUser.enabled) return res.json({ status: 'disabled' });
      return res.json({ status: 'password', name: legacyUser.firstname });
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
    const existingUser = await User.findOne({
      where: { email, programid: program.programid, deleted: 0 },
    });
    if (existingCredential || existingUser) {
      return res.json({ ok: false, error: 'An account with this email address already exists. Please use the login form or reset your password.' });
    }

    const password          = randomPassword();
    const encryptedPassword = await encryptPassword(password);

    const [credential] = await UserCredential.findOrCreate({
      where:    { email },
      defaults: { email, password: encryptedPassword },
    });

    const newUser = await User.create({
      programid:    program.programid,
      credentialid: credential.credentialid,
      email,
      password:     encryptedPassword,
      firstname:    firstname.trim(),
      lastname:     lastname.trim(),
      organisation: '',
      mobile:       (mobile || '').trim(),
      telephone:    '',
      question:     '',
      answer:       '',
      paymentsopen: program.paymentsopendefault ? 1 : 0,
      enabled:      1,
      exclude:      0,
      deleted:      0,
      judge:        0,
      admin:        0,
    });

    mail({
      to:       email,
      subject:  program.name + ' — Your Login Details',
      text:     'Dear ' + newUser.firstname + ',\n\nThank you for registering with the ' + program.name + ' portal.\n\nYour login details are:\n\nEmail:    ' + email + '\nPassword: ' + password + '\n\nPlease log in and change your password via My Profile.\n',
      from:     program.emailfromaddress,
      ...parseSmtp(program.smtpserver),
    }).catch(err => console.warn('Welcome email failed:', err.message));

    return res.json({ ok: true });

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
        program, message: null, form: true,
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

    req.session.save((err) => {
      if (err) return next(err);
      res.redirect('/home');
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
  // Copy personal details from their existing user record in another program
  const source = await User.findOne({
    where:  { credentialid: credential.credentialid, deleted: 0 },
    order:  [['userid', 'ASC']],
  });

  return User.create({
    programid:    program.programid,
    credentialid: credential.credentialid,
    email:        credential.email,
    password:     credential.password,
    firstname:    source?.firstname    || '',
    lastname:     source?.lastname     || '',
    organisation: source?.organisation || '',
    telephone:    source?.telephone    || '',
    mobile:       source?.mobile       || '',
    question:     source?.question     || '',
    answer:       source?.answer       || '',
    paymentsopen: program.paymentsopendefault ? 1 : 0,
    enabled:      1,
    exclude:      0,
    deleted:      0,
    judge:        0,
    admin:        0,
  });
}

export default router;
