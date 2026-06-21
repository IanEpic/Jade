import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import MssqlStore from 'connect-mssql-v2';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import sequelize from './config/sequelize.js';
import { setupAssociations } from './models/associations.js';
import { autoCloseAllPrograms } from './services/autoClose.js';
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

// Trust Cloudflare (and any reverse proxy) so req.secure = true for HTTPS connections.
// Required for secure session cookies to be set correctly behind a proxy.
if (isProd) app.set('trust proxy', 1);

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
app.use(compression());

// Nonce must be generated BEFORE helmet so the CSP directive function can read it.
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64url');
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`, 'https://cdn.tiny.cloud'],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://cdn.tiny.cloud'],
      imgSrc:         ["'self'", 'data:', 'blob:', 'https://cdn.tiny.cloud', 'https://sp.tinymce.com'],
      mediaSrc:       ["'self'", 'blob:'],              // blob: needed for dropzone video preview
      connectSrc:     ["'self'", 'https://cdn.tiny.cloud'],
      fontSrc:        ["'self'", 'https://cdn.tiny.cloud'],
      workerSrc:      ["'self'", 'blob:', 'https://cdn.tiny.cloud'],
      objectSrc:      ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));

app.use(morgan(isProd ? 'combined' : 'dev'));

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
// Note: file uploads go through multer in formResponses.js which sets its own limit.

app.use(session({
  store:             sessionStore,
  secret:            process.env.SESSION_SECRET || 'change-me',
  resave:            false,
  saveUninitialized: false,
  rolling:           true,   // reset expiry on every request
  name:              'jade.sid',
  cookie: {
    secure:   isProd,        // HTTPS only in production
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000,  // 8 hours rolling
  },
}));

// ── Static files ──────────────────────────────────────────────────────────────
// Copy vendored JS from node_modules into public/js at startup (public/js is gitignored).
(async () => {
    const publicJs = path.join(__dirname, '../public/js');
    await fs.mkdir(publicJs, { recursive: true });
    await fs.copyFile(
        path.join(__dirname, '../node_modules/sortablejs/Sortable.min.js'),
        path.join(publicJs, 'sortable.min.js')
    );
})().catch(err => console.error('Failed to copy vendor JS:', err));

app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, filePath) => {
        // JS and CSS change on every deploy — tell CF/browsers not to cache them.
        if (/\.(js|css)$/.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    },
}));

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
// Cache compiled Pug functions — enabled automatically in production but not
// in development. Enable it always: templates only change on server restart anyway.
app.enable('view cache');

// ── Build hash for cache-busting JS/CSS ──────────────────────────────────────
// Read git short SHA once at startup; falls back to process start timestamp.
import { execSync } from 'child_process';
const BUILD_HASH = (() => {
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); }
  catch { return Date.now().toString(36); }
})();

// ── Template globals ──────────────────────────────────────────────────────────
// Makes these available in every Pug template without passing them explicitly.
// requireAuth sets res.locals.user; resolveProgram sets res.locals.program.
app.use((req, res, next) => {
  res.locals.currentYear = new Date().getFullYear();
  res.locals.env         = process.env.NODE_ENV || 'development';
  res.locals.buildHash   = BUILD_HASH;
  next();
});

// ── Template shell middleware ─────────────────────────────────────────────────
// Inline rather than imported to avoid ES module load-order timing issues.
// Attaches res.renderInShell(viewName, locals, options) to every response.
const TEMPLATE_ROOT = process.env.TEMPLATE_ROOT;
if (!TEMPLATE_ROOT) throw new Error('TEMPLATE_ROOT env var is required');

// Builds an entry-close countdown banner injected above page content.
// Returns empty string when no close date is set or it's more than 7 days away.
function buildCloseBanner(program, nonce) {
  const ecd = program?.entryclosedate;
  if (!ecd) return '';
  const closeMs = new Date(ecd).getTime();
  const nowMs   = Date.now();
  const diffMs  = closeMs - nowMs;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (diffMs > sevenDays) return '';

  // Closed already: static message, no timer.
  if (diffMs <= 0) {
    return `<div id="jade-close-banner" style="background:#3a1a1a;color:#f88;padding:10px 20px;text-align:center;font-size:13px;font-weight:600;border-bottom:2px solid #7a2a2a;">` +
           `Entries for this program are now closed.</div>`;
  }

  // Upcoming: dynamic countdown driven by client JS.
  return `<div id="jade-close-banner" data-closedate="${new Date(ecd).toISOString()}" style="background:#1a2a1a;color:#cfc;padding:10px 20px;text-align:center;font-size:13px;border-bottom:2px solid #2a5a2a;">` +
         `<span id="jade-close-msg">Entries close in <strong id="jade-close-countdown"></strong></span>` +
         `</div>` +
         `<script nonce="${nonce}">(function(){` +
         `var banner=document.getElementById('jade-close-banner');` +
         `var cd=document.getElementById('jade-close-countdown');` +
         `var closeMs=new Date(banner.dataset.closedate).getTime();` +
         `function fmt(ms){` +
           `if(ms<=0)return'0s';` +
           `var s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24);` +
           `var ss=('0'+s%60).slice(-2),mm=('0'+m%60).slice(-2),hh=('0'+h%24).slice(-2);` +
           `if(d>=1)return d+'d '+hh+'h '+mm+'m '+ss+'s';` +
           `if(h>=1)return h+'h '+mm+'m '+ss+'s';` +
           `return m+'m '+ss+'s';` +
         `}` +
         `function tick(){` +
           `var diff=closeMs-Date.now();` +
           `if(diff<=0){` +
             `banner.style.background='#3a1a1a';banner.style.color='#f88';banner.style.borderBottomColor='#7a2a2a';` +
             `document.getElementById('jade-close-msg').innerHTML='Entries for this program are now closed.';` +
             `if(typeof markEntriesClosed==='function')markEntriesClosed();` +
             `clearInterval(timer);return;` +
           `}` +
           `if(diff<24*3600*1000){banner.style.background='#3a1500';banner.style.color='#f93';banner.style.borderBottomColor='#7a3a00';}` +
           `else if(diff<48*3600*1000){banner.style.background='#2a2a00';banner.style.color='#ff6';banner.style.borderBottomColor='#5a5a00';}` +
           `if(cd)cd.textContent=fmt(diff);` +
         `}` +
         `tick();var timer=setInterval(tick,1000);` +
         `}());</script>`;
}

// Cache shell HTML in memory — these files sit in the OneDrive-backed Apache
// htdocs folder and never change at runtime; reading them from disk (or OneDrive
// sync) on every request adds significant latency.
const shellCache = new Map();
async function getShell(shellPath) {
  if (shellCache.has(shellPath)) return shellCache.get(shellPath);
  const html = await fs.readFile(shellPath, 'utf8');
  shellCache.set(shellPath, html);
  return html;
}

app.use((req, res, next) => {
  res.renderInShell = async (viewName, locals = {}, options = {}) => {
    try {
      const program = req.program || locals.program;
      if (!program) throw new Error('No program on request');

      const shellFile = options.useLoginShell ? program.loginhtml : program.standardhtml;
      const shellPath = path.join(TEMPLATE_ROOT, shellFile);

      let shell;
      try {
        shell = await getShell(shellPath);
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
        const slug  = program.slug;
        const nonce = res.locals.nonce;
        const otherSlugs = (req.session?.linkedPrograms || [])
            .map(p => p.slug)
            .filter(s => s !== slug);
        const rewriterScript = `<script nonce="${nonce}">
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

        // Inject nonce into any inline <script> tags in the legacy shell that
        // don't already have a src= or nonce= attribute (shell is a static file
        // we can't edit, so we patch it at serve time).
        const programFavicon = program.faviconfile
            ? `<link rel="icon" href="/${program.slug}/admin/favicon">`
            : '<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" type="image/x-icon" href="/favicon.ico">';
        const closeBanner = buildCloseBanner(program, nonce);
        const assembled = shell
            .replace('</head>', programFavicon + '</head>')
            .replace('<CGIINSERT>', closeBanner + content + rewriterScript);
        const withNonces = assembled.replace(/<script(\b[^>]*)>/gi, (match, attrs) => {
            if (/\bsrc=/i.test(attrs) || /\bnonce=/i.test(attrs)) return match;
            return `<script${attrs} nonce="${nonce}">`;
        });
        res.send(withNonces);
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
const NON_SLUG_PREFIXES = ['/favicon.ico', '/favicon.svg'];
app.use((req, res, next) => {
  if (NON_SLUG_PREFIXES.some(p => req.path.startsWith(p))) {
    return res.status(404).end();
  }
  next();
});

// Uptime monitor — used by Cloudflare LB health checks. No auth, no middleware.
app.all('/uptimemonitor', async (req, res) => {
  try {
    await sequelize.authenticate();
    await fs.access(process.env.FILESTORE_ROOT, fs.constants.R_OK | fs.constants.W_OK);
    res.status(200).send('OK');
  } catch (err) {
    res.status(500).send(err.message);
  }
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
    <html><head><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" type="image/x-icon" href="/favicon.ico"></head>
    <body style="font-family:sans-serif; max-width:600px; margin:80px auto; text-align:center;">
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

    // Auto-close entries for programs whose entryclosedate has passed.
    // Runs immediately on startup and then every minute.
    autoCloseAllPrograms().catch(console.error);
    setInterval(() => autoCloseAllPrograms().catch(console.error), 60 * 1000);
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
