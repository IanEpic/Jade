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
import { resolveProgram } from './middleware/resolveProgram.js';
import rootLoginRouter   from './routes/rootLogin.js';
import programRouter from './routes/program.js';
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

const TINYMCE_ROOT = process.env.TINYMCE_ROOT
    || 'C:/Users/SystemAdmin/OneDrive - The Epic Team Pty Limited/WebProjects/Apache/htdocs/jade/htdocs/tinymce';
app.use('/tinymce', express.static(TINYMCE_ROOT));

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

        // Inject a small script that rewrites all absolute internal href/action
        // attributes to be slug-prefixed (e.g. /home → /aea25/home).
        // This means templates don't need to know the slug — they keep using
        // plain absolute paths and the rewriter fixes them at runtime.
        const slug = program.slug;
        const otherSlugs = (req.session?.linkedPrograms || [])
            .map(p => p.slug)
            .filter(s => s !== slug);
        const rewriterScript = `<script>
window.JADE_SLUG='${slug}';
window.JADE_BASE='/${slug}';
(function(){
  var base=window.JADE_BASE;
  var otherSlugs=${JSON.stringify(otherSlugs)};
  function fix(el,attr){
    var v=el.getAttribute(attr);
    if(v&&v.charAt(0)==='/'&&v.indexOf(base)!==0){var seg=v.split('/')[1];if(seg&&otherSlugs.indexOf(seg)!==-1)return;el.setAttribute(attr,base+v);}
  }
  function rewrite(){
    [].forEach.call(document.querySelectorAll('a[href]'),function(a){fix(a,'href');});
    [].forEach.call(document.querySelectorAll('form[action]'),function(f){fix(f,'action');});
    [].forEach.call(document.querySelectorAll('img[src]'),function(i){fix(i,'src');});
    [].forEach.call(document.querySelectorAll('source[src]'),function(s){fix(s,'src');});
    [].forEach.call(document.querySelectorAll('video[src]'),function(v){fix(v,'src');});
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',rewrite);}
  else{rewrite();}
})();
</script>`;

        res.send(shell.replace('<CGIINSERT>', content + rewriterScript));
      });

    } catch (err) {
      next(err);
    }
  };
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
// Known static path prefixes that must NOT be treated as program slugs.
// Add to this list if any other static assets conflict with the slug route.
const NON_SLUG_PREFIXES = ['/favicon.ico'];
app.use((req, res, next) => {
  if (NON_SLUG_PREFIXES.some(p => req.path.startsWith(p))) {
    return res.status(404).end();
  }
  next();
});

// Platform-level login — must be mounted before /:slug to avoid 'login' being
// treated as a program slug.
app.use('/login', rootLoginRouter);

// All program-scoped routes live under /:slug.
// resolveProgram middleware loads the program from the slug and wraps
// res.redirect so internal absolute redirects are automatically slug-prefixed.
app.use('/:slug', resolveProgram, programRouter);

// ── Root ──────────────────────────────────────────────────────────────────────
// TODO: Replace with public marketing site (features, pricing, signup).
app.get('/', (req, res) => {
  res.send(`
    <html><body style="font-family:sans-serif; max-width:600px; margin:80px auto; text-align:center;">
      <h1>JADE Awards Platform</h1>
      <p>Public marketing site coming soon.</p>
      <p><a href="/login">Log in</a></p>
    </body></html>
  `);
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
