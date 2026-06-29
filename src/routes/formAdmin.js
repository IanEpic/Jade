// routes/formAdmin.js
// Equivalent of formAdmin.cgi.
// Admin-only program settings page — controls phase flags, menus, and all rich-text fields.

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { bustProgramCache } from '../services/auth.js';
import Program  from '../models/Program.js';
import JudgingModel from '../models/JudgingModel.js';
import { getPool, sql } from '../config/database.js';
import multer   from 'multer';
import path     from 'path';
import { programDir, docHeaderPath } from '../services/cqDocs.js';
import { sanitizeThemeInput, parseTheme, DARK_CORE, DEFAULT_TOKENS } from '../services/theme.js';
import Entry from '../models/Entry.js';
import fs       from 'fs/promises';
import fsSync   from 'fs';

const FILESTORE_ROOT  = process.env.FILESTORE_ROOT || 'C:/Data/LocalJadeFilestore';
const FAVICONS_DIR    = path.join(FILESTORE_ROOT, 'favicons');

const docHeaderUpload = multer({
    storage: multer.diskStorage({
        destination: async (req, file, cb) => {
            const dir = programDir(req.user.programid);   // {root}/programs/{pid}
            await fs.mkdir(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => cb(null, 'docheader' + (path.extname(file.originalname).toLowerCase() || '.png')),
    }),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
    fileFilter: (req, file, cb) => cb(null, ['.png', '.jpg', '.jpeg'].includes(path.extname(file.originalname).toLowerCase())),
});

const faviconUpload = multer({
    storage: multer.diskStorage({
        destination: async (req, file, cb) => {
            const dir = path.join(FAVICONS_DIR, String(req.user.programid));
            await fs.mkdir(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase() || '.png';
            cb(null, 'favicon' + ext);
        },
    }),
    limits: { fileSize: 512 * 1024 }, // 512 KB max
    fileFilter: (req, file, cb) => {
        const allowed = ['.svg', '.png', '.ico'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    },
});


const router = Router();

function buildSmtpJson(body, program) {
    const host = (body.smtp_host || '').trim();
    const port = parseInt(body.smtp_port) || null;
    if (!host) return program.smtpserver; // unchanged
    const obj = { host };
    if (port) obj.port = port;
    return JSON.stringify(obj);
}
router.use(requireAuth, requireAdmin);

// ── GET /formAdmin ─────────────────────────────────────────────────────────────
// Program settings are now served within the home framework at home?action=program
router.get('/', (req, res) => res.redirect('/home?action=program'));

// ── POST /formAdmin ────────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = await Program.findByPk(user.programid);
        const body    = req.body;

        // Boolean fields
        const boolField = (key) => body[key] ? 1 : 0;

        await program.update({
            name:                    body.name                    || program.name,
            portalopen:              boolField('portalopen'),
            entriesopendefault:      boolField('entriesopen'),
            paymentsopendefault:     boolField('paymentsopen'),
            judgingopendefault:      boolField('judgingopen'),
            scorereadydefault:       boolField('scoreready'),
            finalistreviewdefault:   boolField('finalistreview'),
            wildcarddecisiondefault: boolField('wildcarddecision'),
            winnernominationdefault: boolField('winnernomination'),
            finalistlistavailable:   boolField('finalistlistavailable'),
            finalistscoresavailable: boolField('finalistscoresavailable'),
            nonfinalistscoresavailable: boolField('nonfinalistscoresavailable'),
            feedbackopen:            boolField('feedbackopen'),
            lockscores:              boolField('lockscores'),
            standardhtml:            body.standardhtml            || program.standardhtml,
            emailhtml:               body.emailhtml               || program.emailhtml,
            loginhtml:               body.loginhtml               || program.loginhtml,
            smtpserver:              buildSmtpJson(body, program),
            emailfromaddress:        body.emailfromaddress        || program.emailfromaddress,
            invoicenoprecursor:      body.invoicenoprecursor      || program.invoicenoprecursor,
            ewaycustomerno:          body.ewaycustomerno          || program.ewaycustomerno,
            ewaygatewayaddress:      body.ewaygatewayaddress      || program.ewaygatewayaddress,
            loginpagetext:           body.loginpagetext,
            invoicefromtext:         body.invoicefromtext,
            paymentinstructionstext: body.paymentinstructionstext,
            remittanceadvicetext:    body.remittanceadvicetext,
            receipttext:             body.receipttext,
            adminwelcometext:        body.adminwelcometext,
            judgewelcometext:        body.judgewelcometext,
            finalistdescriptiontext: body.finalistdescriptiontext,
            finalistwelcometext:     body.finalistwelcometext,
            nonfinalistwelcometext:  body.nonfinalistwelcometext,
            standardwelcometext:     body.standardwelcometext,
            entrytctext:             body.entrytctext,
            judgetctext:             body.judgetctext,
            userhelptext:            body.userhelptext,
            judgehelptext:           body.judgehelptext,
            judgecontacttext:        body.judgecontacttext,
            scoresexplained:         body.scoresexplained,
            downloadpagehtml:        body.downloadpagehtml,
            costexplanationtext:     body.costexplanationtext,
            entryclosedate:          body.entryclosedate ? new Date(body.entryclosedate).toISOString().replace('T', ' ').slice(0, 23) : null,
        });

        // Judge conflict-of-interest policy lives on the program's (now per-program) JudgingModel.
        if (body.judgeconflictmodel != null && program.judgingmodelid) {
            const policy = parseInt(body.judgeconflictmodel);
            if (policy >= 0 && policy <= 4) {
                await JudgingModel.update(
                    { judgeconflictmodel: policy },
                    { where: { judgingmodelid: program.judgingmodelid } },
                );
            }
        }

        // Overwrite — apply defaults to all categories/users
        if (body.overwrite || body['overwrite-payments']) {
            const pool = await getPool();

            if (body['overwrite-payments']) {
                await pool.request()
                    .input('paymentsopen', sql.Int, boolField('paymentsopen'))
                    .input('programid',    sql.Int, program.programid)
                    .query(`UPDATE [User] SET paymentsopen = @paymentsopen WHERE programid = @programid`);
            }

            if (body.overwrite) {
                await pool.request()
                    .input('entriesopen',      sql.Int, boolField('entriesopen'))
                    .input('judgingopen',      sql.Int, boolField('judgingopen'))
                    .input('scoreready',       sql.Int, boolField('scoreready'))
                    .input('finalistreview',   sql.Int, boolField('finalistreview'))
                    .input('wildcarddecision', sql.Int, boolField('wildcarddecision'))
                    .input('winnernomination', sql.Int, boolField('winnernomination'))
                    .input('programid',        sql.Int, program.programid)
                    .query(`UPDATE Category SET
                        entriesopen      = @entriesopen,
                        judgingopen      = @judgingopen,
                        scoreready       = @scoreready,
                        finalistreview   = @finalistreview,
                        wildcarddecision = @wildcarddecision,
                        winnernomination = @winnernomination
                      WHERE programid = @programid AND deleted = 0`);

                // If overwrite is opening entries, clear the auto-close date so the
                // scheduler doesn't immediately re-close them on its next tick.
                if (boolField('entriesopen')) {
                    await program.update({ entryclosedate: null });
                }
            }
        }

        bustProgramCache(program.slug, program.fqdn);
        res.redirect('/home?action=program&saved=1');
    } catch (err) {
        next(err);
    }
});

// ── POST /admin/upload-favicon ────────────────────────────────────────────────

router.post('/upload-favicon', faviconUpload.single('favicon'), async (req, res, next) => {
    try {
        if (!req.file) return res.json({ status: 'E_NOFILE' });
        const program = await Program.findByPk(req.user.programid);
        await program.update({ faviconfile: req.file.filename });
        bustProgramCache(program.slug, program.fqdn);
        res.json({ status: 'OK', filename: req.file.filename });
    } catch (err) { next(err); }
});

// ── POST /admin/theme ─────────────────────────────────────────────────────────
// Save the look-and-feel design tokens (JSON) from the Theme editor. Refuses to theme a legacy
// program that doesn't already have a theme would be a no-op concern — we only ever save for a
// program the admin is actively theming; guard keeps 1056 (no theme) from accidentally becoming
// token-driven unless explicitly enabled.
router.post('/theme', async (req, res, next) => {
    try {
        const program = await Program.findByPk(req.user.programid);
        let payload;
        try { payload = JSON.parse(req.body.theme || '{}'); } catch { return res.json({ status: 'E_BADJSON' }); }
        const clean = sanitizeThemeInput(payload);
        // Preserve uploaded assets (logo, background image) — they're set by the upload routes, not
        // sent in the editor's save payload, so re-attach them from the existing theme.
        const existing = parseTheme(program) || {};
        if (existing.logo) clean.logo = existing.logo;
        if (existing.emailHeader) clean.emailHeader = existing.emailHeader;
        if (existing.background && existing.background.image) {
            clean.background = Object.assign({}, clean.background, { image: existing.background.image });
        }
        await program.update({ theme: JSON.stringify(clean) });
        bustProgramCache(program.slug, program.fqdn);
        res.json({ status: 'OK' });
    } catch (err) { next(err); }
});

// ── Themed-program assets: logo (header band) + background image ───────────────
function themeAssetUpload(name) {
    return multer({
        storage: multer.diskStorage({
            destination: async (req, file, cb) => {
                const dir = programDir(req.user.programid);
                await fs.mkdir(dir, { recursive: true });
                cb(null, dir);
            },
            filename: (req, file, cb) => cb(null, name + (path.extname(file.originalname).toLowerCase() || '.png')),
        }),
        limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
        fileFilter: (req, file, cb) => cb(null, ['.png', '.jpg', '.jpeg', '.svg', '.webp'].includes(path.extname(file.originalname).toLowerCase())),
    });
}
const logoUpload        = themeAssetUpload('logo');
const themeBgUpload     = themeAssetUpload('themebg');
const emailHeaderUpload = themeAssetUpload('emailheader');

async function saveThemeAsset(programid, mutate) {
    const program = await Program.findByPk(programid);
    const t = parseTheme(program) || {};
    await mutate(t, program);
    await program.update({ theme: JSON.stringify(t) });
    bustProgramCache(program.slug, program.fqdn);
}

router.post('/upload-logo', logoUpload.single('logo'), async (req, res, next) => {
    try {
        if (!req.file) return res.json({ status: 'E_NOFILE' });
        await saveThemeAsset(req.user.programid, (t) => { t.logo = req.file.filename; });
        res.json({ status: 'OK' });
    } catch (err) { next(err); }
});
router.post('/delete-logo', async (req, res, next) => {
    try {
        await saveThemeAsset(req.user.programid, async (t, program) => {
            if (t.logo) { const p = docHeaderPath(program.programid, t.logo); if (p) await fs.unlink(p).catch(() => {}); delete t.logo; }
        });
        res.json({ status: 'OK' });
    } catch (err) { next(err); }
});
router.post('/upload-themebg', themeBgUpload.single('themebg'), async (req, res, next) => {
    try {
        if (!req.file) return res.json({ status: 'E_NOFILE' });
        await saveThemeAsset(req.user.programid, (t) => { t.background = Object.assign({}, t.background, { image: req.file.filename }); });
        res.json({ status: 'OK' });
    } catch (err) { next(err); }
});
router.post('/delete-themebg', async (req, res, next) => {
    try {
        await saveThemeAsset(req.user.programid, async (t, program) => {
            const img = t.background && t.background.image;
            if (img) { const p = docHeaderPath(program.programid, img); if (p) await fs.unlink(p).catch(() => {}); delete t.background.image; }
        });
        res.json({ status: 'OK' });
    } catch (err) { next(err); }
});
router.post('/upload-emailheader', emailHeaderUpload.single('emailheader'), async (req, res, next) => {
    try {
        if (!req.file) return res.json({ status: 'E_NOFILE' });
        await saveThemeAsset(req.user.programid, (t) => { t.emailHeader = req.file.filename; });
        res.json({ status: 'OK', filename: req.file.filename });
    } catch (err) { next(err); }
});
router.post('/delete-emailheader', async (req, res, next) => {
    try {
        await saveThemeAsset(req.user.programid, async (t, program) => {
            if (t.emailHeader) { const p = docHeaderPath(program.programid, t.emailHeader); if (p) await fs.unlink(p).catch(() => {}); delete t.emailHeader; }
        });
        res.json({ status: 'OK' });
    } catch (err) { next(err); }
});

// Enable token-driven theming on a program that doesn't have a theme yet. Guarded: refuses if the
// program already has entries (protects live programs like 1056 from being switched to themed).
router.post('/enable-theme', async (req, res, next) => {
    try {
        const program = await Program.findByPk(req.user.programid);
        if (parseTheme(program)) return res.json({ status: 'OK' }); // already themed
        const entryCount = await Entry.count({ where: { programid: program.programid, deleted: false } });
        if (entryCount > 0) return res.json({ status: 'E_HASENTRIES' });
        const theme = { mode: 'dark', core: { ...DARK_CORE }, overrides: {}, tokens: { ...DEFAULT_TOKENS } };
        await program.update({ theme: JSON.stringify(theme) });
        bustProgramCache(program.slug, program.fqdn);
        res.json({ status: 'OK' });
    } catch (err) { next(err); }
});

// ── POST /admin/upload-docheader ──────────────────────────────────────────────
// Wide logo/banner used in the header band of the generated Category Documents.

router.post('/upload-docheader', docHeaderUpload.single('docheader'), async (req, res, next) => {
    try {
        if (!req.file) return res.json({ status: 'E_NOFILE' });
        const program = await Program.findByPk(req.user.programid);
        await program.update({ docheaderimage: req.file.filename });
        bustProgramCache(program.slug, program.fqdn);
        res.json({ status: 'OK', filename: req.file.filename });
    } catch (err) { next(err); }
});

router.post('/delete-docheader', async (req, res, next) => {
    try {
        const program = await Program.findByPk(req.user.programid);
        if (program.docheaderimage) {
            const p = docHeaderPath(program.programid, program.docheaderimage);
            if (p) await fs.unlink(p).catch(() => {});
            await program.update({ docheaderimage: null });
            bustProgramCache(program.slug, program.fqdn);
        }
        res.json({ status: 'OK' });
    } catch (err) { next(err); }
});

// ── GET /admin/docheader ──────────────────────────────────────────────────────
// Serves the current doc header image into the admin preview.
router.get('/docheader', async (req, res) => {
    const program = await Program.findByPk(req.user.programid);
    if (!program?.docheaderimage) return res.status(404).end();
    const filePath = docHeaderPath(program.programid, program.docheaderimage);
    if (!filePath || !fsSync.existsSync(filePath)) return res.status(404).end();
    res.sendFile(filePath, err => { if (err && !res.headersSent) res.status(404).end(); });
});

// ── DELETE /admin/favicon ─────────────────────────────────────────────────────

router.post('/delete-favicon', async (req, res, next) => {
    try {
        const program = await Program.findByPk(req.user.programid);
        if (program.faviconfile) {
            const filePath = path.join(FAVICONS_DIR, String(program.programid), program.faviconfile);
            await fs.unlink(filePath).catch(() => {});
            await program.update({ faviconfile: null });
            bustProgramCache(program.slug, program.fqdn);
        }
        res.json({ status: 'OK' });
    } catch (err) { next(err); }
});

export default router;
