// routes/formAdmin.js
// Equivalent of formAdmin.cgi.
// Admin-only program settings page — controls phase flags, menus, and all rich-text fields.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Program  from '../models/Program.js';
import { getPool, sql } from '../config/database.js';


const router = Router();

function buildSmtpJson(body, program) {
    const host = (body.smtp_host || '').trim();
    const port = parseInt(body.smtp_port) || null;
    if (!host) return program.smtpserver; // unchanged
    const obj = { host };
    if (port) obj.port = port;
    return JSON.stringify(obj);
}
router.use(requireAuth);

router.use((req, res, next) => {
    if (!req.user.admin) return res.redirect('/home');
    next();
});

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
        });

        // Overwrite — apply defaults to all categories/users
        if (body.overwrite) {
            const pool = await getPool();
            await pool.request()
                .input('paymentsopen', sql.Int, boolField('paymentsopen'))
                .input('programid',    sql.Int, program.programid)
                .query(`UPDATE [User] SET paymentsopen = @paymentsopen WHERE programid = @programid`);
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
                  WHERE programid = @programid`);
        }

        res.redirect('/home?action=program&saved=1');
    } catch (err) {
        next(err);
    }
});

export default router;
