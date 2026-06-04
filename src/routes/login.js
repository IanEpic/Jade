// routes/login.js
// Express equivalent of login.cgi
//
// The Perl script used cookies to carry email+password on every request.
// The Node version uses a proper server-side session instead — the password
// is verified once at login and the userId is stored in the session.
// Credentials are never stored in a cookie.
//
// Route map:
//   GET  /login               → show login form (was: !param())
//   GET  /login?action=change_email     → show change_email message
//   GET  /login?action=change_password  → show change_password message
//   POST /login               → validate credentials, create session
//   GET  /logout              → destroy session

import { Router } from 'express';
import { login, recordLogon, getLinkedPrograms } from '../services/auth.js';

const router = Router();

// req.program is already set by the resolveProgram middleware in program.js
// (extracted from the /:slug URL param). No fqdn lookup needed here.

// ── GET /login ────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { program } = req;

    // Replaces: if (!$openforbusiness) → maintenance message
    if (!program.portalopen) {
      return res.renderInShell('login', {
        program,
        message: 'The Portal is Currently Closed for Maintenance',
        form: false,
      });
    }

    // Already logged in — go home
    // Replaces: if ($user) { relocatehome; exit; }
    if (req.session.userId) {
      return res.redirect('/home');
    }

    // Replaces: param('action') eq 'change_email' / 'change_password'
    if (req.query.action === 'change_email') {
      return res.renderInShell('login', {
        program,
        message: 'As you have changed your email address we have automatically reset your password. You will shortly receive an email containing your new password.',
        form: true,
      });
    }
    if (req.query.action === 'change_password') {
      return res.renderInShell('login', {
        program,
        message: 'As you have changed your password, please log in again.',
        form: true,
      });
    }

    // Replaces: readfile($loginhtml, [&$form_blank])
    res.renderInShell('login', { program, message: null, form: true, errors: [] });

  } catch (err) {
    next(err);
  }
});

// ── POST /login ───────────────────────────────────────────────────────────────
// Replaces: the param() block that validates credentials and sets cookies
router.post('/', async (req, res, next) => {
  try {
    const { program } = req;
    const { email, password } = req.body;

    if (!program.portalopen) {
      return res.renderInShell('login', {
        program,
        message: 'The Portal is Currently Closed for Maintenance',
        form: false,
      });
    }

    const result = await login(email, password, program.programid);

    if (!result) {
      return res.renderInShell('login', {
        program,
        message: null,
        form: true,
        errors: ['There has been an error confirming your credentials.'],
      });
    }

    const { user, credential } = result;

    await recordLogon(user.userid);

    req.session.userId        = user.userid;
    req.session.programId     = program.programid;
    req.session.programSlug   = program.slug;
    req.session.credentialId  = credential?.credentialid ?? null;

    // Load all programs this credential can access (for the switcher)
    if (credential) {
      req.session.linkedPrograms = await getLinkedPrograms(credential.credentialid);
    }

    if (req.body.emulateuser && user.admin) {
      req.session.emulateUserId = req.body.emulateuser;
    }

    // Replaces: relocatehome
    // Explicit save ensures the session is written to the MSSQL store
    // before the redirect fires (avoids a race condition).
    req.session.save((err) => {
      if (err) return next(err);
      res.redirect('/home');
    });

  } catch (err) {
    next(err);
  }
});

// ── GET /logout ───────────────────────────────────────────────────────────────
// The Perl app had a logout.cgi — this replaces it.
router.get('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.redirect('/login');
  });
});

export default router;
