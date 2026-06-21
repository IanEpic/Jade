// routes/formAdmin.js
// Equivalent of formAdmin.cgi.
// Admin-only program settings page — controls phase flags, menus, and all rich-text fields.

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { bustProgramCache } from '../services/auth.js';
import Program  from '../models/Program.js';
import { getPool, sql } from '../config/database.js';
import multer   from 'multer';
import path     from 'path';
import fs       from 'fs/promises';

const FILESTORE_ROOT  = process.env.FILESTORE_ROOT || 'C:/Data/LocalJadeFilestore';
const FAVICONS_DIR    = path.join(FILESTORE_ROOT, 'favicons');

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
            faveventavailable:       boolField('faveventavailable'),
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
