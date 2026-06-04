import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import MssqlStore from 'connect-mssql-v2';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import sequelize from './config/sequelize.js';
import { setupAssociations } from './models/associations.js';
import entryRouter from './routes/entry.js';
import loginRouter from './routes/login.js';
import homeRouter            from './routes/home.js';
import formEntrantRouter     from './routes/formEntrant.js';
import tcRouter              from './routes/tc.js';
import formEntryRouter       from './routes/formEntry.js';
import viewEntryRouter       from './routes/viewEntry.js';
import formPaymentOptionsRouter from './routes/formPaymentOptions.js';
import formAdminRouter       from './routes/formAdmin.js';
import formCategoryRouter    from './routes/formCategory.js';
import formUserRouter        from './routes/formUser.js';
import registerRouter        from './routes/register.js';
import formInvoiceRouter     from './routes/formInvoice.js';
import formPaymentRouter     from './routes/formPayment.js';
import formResponsesRouter   from './routes/formResponses.js';
import formQuestionRouter    from './routes/formQuestion.js';
import recordScoresRouter    from './routes/recordScores.js';
import simpleReviewRouter    from './routes/simpleReview.js';
import finaliseEntryRouter   from './routes/finaliseEntry.js';
import formJudgeRouter       from './routes/formJudge.js';
import judgeAllocationRouter from './routes/judgeAllocation.js';
import judgeEmailRouter      from './routes/judgeEmail.js';
import judgetcRouter         from './routes/judgetc.js';
import nominateWinnerRouter  from './routes/nominatewinner.js';
import nominateWildcardRouter from './routes/nominatewildcard.js';
import feedbackRouter        from './routes/feedback.js';
import passwordResetRouter   from './routes/passwordReset.js';
import formEligibilityRouter from './routes/formEligibility.js';
import formPageRouter        from './routes/formPage.js';
import explainscoresRouter   from './routes/explainscores.js';
import viewPageRouter        from './routes/viewPage.js';
// import judgeRouter   from './routes/judge.js';
// import adminRouter   from './routes/admin.js';
// import paymentRouter from './routes/payment.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ── Session store ─────────────────────────────────────────────────────────────
// Replaces CGI cookie-based auth (email + password cookies on every request).
// Sessions are stored in MSSQL so they survive server restarts.
const sessionStore = new MssqlStore({
  server:   process.env.DB_HOST,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  options: {
    encrypt:                false,
    trustServerCertificate: true,
    enableArithAbort:       true,
  },
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({
  // Relax CSP during migration — tighten once all inline scripts are extracted
  contentSecurityPolicy: false,
}));

app.use(morgan(isProd ? 'combined' : 'dev'));

app.use(express.urlencoded({ extended: true, limit: '200mb' }));  // equiv of $CGI::POST_MAX
app.use(express.json({ limit: '200mb' }));

app.use(session({
  store:             sessionStore,
  secret:            process.env.SESSION_SECRET || 'change-me',
  resave:            false,
  saveUninitialized: false,
  name:              'jade.sid',
  cookie: {
    secure:   isProd,        // HTTPS only in production
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000,  // 8 hours — typical awards session
  },
}));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// Legacy per-program assets (CSS, images) — served from the existing Apache htdocs folder.
// Replaces Apache serving /htdocs/jade/htdocs/wwwref directly.
// HTML shells reference these as ../wwwref/... which resolves to /wwwref/... in a browser.
const WWWREF_ROOT = process.env.WWWREF_ROOT
    || 'C:/Users/SystemAdmin/OneDrive - The Epic Team Pty Limited/WebProjects/Apache/htdocs/jade/htdocs/wwwref';
app.use('/wwwref', express.static(WWWREF_ROOT));

// Files/images/videos are served via /formResponses/image|video|download routes,
// which handle the convertedImageStore → originalImages fallback for legacy Perl files.

// ── View engine ───────────────────────────────────────────────────────────────
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// ── Template globals ──────────────────────────────────────────────────────────
// Makes these available in every Pug template without passing them explicitly.
// Equivalent of the global $INPUT, $user etc. that Perl scripts relied on.
app.use((req, res, next) => {
  res.locals.user        = req.user || null;
  res.locals.currentYear = new Date().getFullYear();
  res.locals.env         = process.env.NODE_ENV || 'development';
  next();
});

// ── Template shell middleware ─────────────────────────────────────────────────
// Inline rather than imported to avoid ES module load-order timing issues.
// Attaches res.renderInShell(viewName, locals, options) to every response.
const TEMPLATE_ROOT = process.env.TEMPLATE_ROOT
    || 'C:/Data/WebProjects/Apache/htdocs/jade/cgi-bin/design';

app.use((req, res, next) => {
  res.renderInShell = async (viewName, locals = {}, options = {}) => {
    try {
      const program = req.program || locals.program;
      if (!program) throw new Error('No program on request');

      const shellFile = options.useLoginShell ? program.loginhtml : program.standardhtml;
      const shellPath = path.join(TEMPLATE_ROOT, shellFile);

      let shell;
      try {
        shell = await fs.readFile(shellPath, 'utf8');
      } catch {
        throw new Error(`Template shell not found: ${shellPath}`);
      }

      // For legacy HTML shells, render the -content partial (no extends layout)
      // For new Pug layouts, render the full view (which extends its own layout)
      const contentView = `${viewName}-content`;
      res.render(contentView, { ...locals, ...options }, (err, content) => {
        if (err) return next(err);
        res.send(shell.replace('<CGIINSERT>', content));
      });

    } catch (err) {
      next(err);
    }
  };
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/login',   loginRouter);
app.get('/logout',  (req, res) => res.redirect('/login/logout'));
app.use('/entry',   entryRouter);
app.use('/home',                homeRouter);
app.use('/formEntrant',         formEntrantRouter);
app.use('/tc',                  tcRouter);
app.use('/formEntry',           formEntryRouter);
app.use('/viewEntry',           viewEntryRouter);
app.use('/formPaymentOptions',  formPaymentOptionsRouter);
app.use('/admin',               formAdminRouter);
app.use('/formCategory',        formCategoryRouter);
app.use('/formUser',            formUserRouter);
app.use('/register',            registerRouter);
app.use('/formInvoice',         formInvoiceRouter);
app.use('/formPayment',         formPaymentRouter);
app.use('/formResponses',       formResponsesRouter);
app.use('/formQuestion',        formQuestionRouter);
app.use('/recordScores',        recordScoresRouter);
app.use('/simpleReview',        simpleReviewRouter);
app.use('/finaliseEntry',       finaliseEntryRouter);
app.use('/formJudge',           formJudgeRouter);
app.use('/judgeAllocation',     judgeAllocationRouter);
app.use('/judgeEmail',          judgeEmailRouter);
app.use('/judgetc',             judgetcRouter);
app.use('/nominatewinner',      nominateWinnerRouter);
app.use('/nominatewildcard',    nominateWildcardRouter);
app.use('/feedback',            feedbackRouter);
app.use('/password-reset',      passwordResetRouter);
app.use('/formEligibility',     formEligibilityRouter);
app.use('/formPage',            formPageRouter);
app.use('/explainscores',       explainscoresRouter);
app.use('/viewPage',            viewPageRouter);
app.get('/formUser.cgi',        (req, res) => res.redirect('/formUser' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));
// Compat: old /response/:entryid/:page URLs → /formResponses?entryid=X
app.get('/response/:entryid/:page', (req, res) => res.redirect(`/formResponses?entryid=${req.params.entryid}`));
// app.use('/judge',   judgeRouter);
// app.use('/admin',   adminRouter);
// app.use('/payment', paymentRouter);

// ── Emulation ─────────────────────────────────────────────────────────────────
app.get('/emulate', (req, res) => {
  const { userId } = req.query;
  if (!req.session?.userId) return res.redirect('/login');
  if (userId && req.session.adminUserId) {
    // Switch to a different emulated user (still admin session)
    req.session.emulateUserId = parseInt(userId);
  } else if (userId) {
    // Start emulation — store real admin id for cease
    req.session.adminUserId   = req.session.userId;
    req.session.emulateUserId = parseInt(userId);
  } else {
    // Cease emulation
    req.session.emulateUserId = null;
  }
  res.redirect('/home');
});

// ── Root ──────────────────────────────────────────────────────────────────────
// Redirect unauthenticated users to login, authenticated to home.
// Replace the res.redirect('/home') with homeRouter once home.cgi is converted.
app.get('/', (req, res) => {
  if (!req.session?.userId) {
    return res.redirect('/login');
  }
  res.redirect('/home');  // swap for homeRouter once converted
});

// ── 404 ───────────────────────────────────────────────────────────────────────
// Replaces: page_not_found_error() from EPIC::JADE::Common
app.use((req, res) => {
  res.status(404).render('error', {
    message: 'Page not found.',
    link:    { href: '/', label: 'Return home' },
  });
});

// ── Error handler ─────────────────────────────────────────────────────────────
// Catches anything thrown with next(err) in route handlers.
// In Perl, unhandled errors just printed to STDERR and the page died silently.
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).render('error', {
    message: isProd ? 'Something went wrong.' : err.message,
    stack:   isProd ? null : err.stack,
    link:    { href: '/', label: 'Return home' },
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
async function start() {
  try {
    // Test DB connection and set up model associations
    await sequelize.authenticate();
    console.log('Database connected');

    setupAssociations();
    console.log('Model associations ready');

    // Sync models in dev to catch schema drift — never use force:true in prod
    if (!isProd) {
      await sequelize.sync({ alter: false });
    }

    app.listen(PORT, () => {
      console.log(`JADE running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
