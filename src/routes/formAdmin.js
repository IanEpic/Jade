// routes/formAdmin.js
// Equivalent of formAdmin.cgi.
// Admin-only program settings page — controls phase flags, menus, and all rich-text fields.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Program  from '../models/Program.js';
import TopMenu  from '../models/TopMenu.js';
import Category from '../models/Category.js';
import User     from '../models/User.js';
import { getPool, sql } from '../config/database.js';

const NO_OF_MENU_BUTTONS = 6;

const router = Router();
router.use(requireAuth);

// Admin guard
router.use((req, res, next) => {
    if (!req.user.admin) {
        return res.renderInShell('formAdmin', {
            user: req.user, program: req.user.program, error: 'noaccess',
            menuButtons: { admin: [], judge: [], user: [] },
            entryExceptions: [], paymentExceptions: [], judgingExceptions: [],
        });
    }
    next();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getMenuButtons(topMenuId) {
    if (!topMenuId) return Array(NO_OF_MENU_BUTTONS).fill(null);
    const pool = await getPool();
    const result = await pool.request()
        .input('topMenuId', sql.Int, topMenuId)
        .query(`SELECT * FROM TopMenuButton WHERE topmenuid = @topMenuId ORDER BY topmenubuttonid`);
    const buttons = result.recordset;
    // Pad to NO_OF_MENU_BUTTONS
    while (buttons.length < NO_OF_MENU_BUTTONS) buttons.push(null);
    return buttons.slice(0, NO_OF_MENU_BUTTONS);
}

async function upsertTopMenu(existingMenuId, buttonPrefix, body) {
    const pool = await getPool();

    let topMenuId = existingMenuId;
    if (!topMenuId) {
        const result = await pool.request().query(`INSERT INTO TopMenu DEFAULT VALUES; SELECT SCOPE_IDENTITY() AS topmenuid`);
        topMenuId = result.recordset[0].topmenuid;
    } else {
        await pool.request()
            .input('topMenuId', sql.Int, topMenuId)
            .query(`DELETE FROM TopMenuButton WHERE topmenuid = @topMenuId`);
    }

    for (let i = 0; i < NO_OF_MENU_BUTTONS; i++) {
        const text      = body[`${buttonPrefix}~text~${i}`]      || '';
        const url       = body[`${buttonPrefix}~url~${i}`]       || '';
        const newwindow = body[`${buttonPrefix}~newwindow~${i}`] ? 1 : 0;
        await pool.request()
            .input('topmenuid',  sql.Int,     topMenuId)
            .input('text',       sql.VarChar,  text)
            .input('url',        sql.VarChar,  url)
            .input('newwindow',  sql.Int,      newwindow)
            .query(`INSERT INTO TopMenuButton (topmenuid, text, url, newwindow) VALUES (@topmenuid, @text, @url, @newwindow)`);
    }
    return topMenuId;
}

// ── GET /formAdmin ─────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;

        const [adminButtons, judgeButtons, userButtons] = await Promise.all([
            getMenuButtons(program.adminmenu),
            getMenuButtons(program.judgemenu),
            getMenuButtons(program.usermenu),
        ]);

        // Entry/payment/judging exceptions
        const isEntriesOpenDefault   = !!program.entriesopendefault;
        const isPaymentsOpenDefault  = !!program.paymentsopendefault;
        const isJudgingOpenDefault   = !!program.judgingopendefault;

        const [entryExceptions, paymentExceptions, judgingExceptions] = await Promise.all([
            Category.findAll({ where: { programid: program.programid, entriesopen: isEntriesOpenDefault ? 0 : 1 } }),
            User.findAll({     where: { programid: program.programid, paymentsopen: isPaymentsOpenDefault ? 0 : 1 } }),
            Category.findAll({ where: { programid: program.programid, judgingopen: isJudgingOpenDefault ? 0 : 1 } }),
        ]);

        res.renderInShell('formAdmin', {
            user, program, error: null,
            menuButtons: { admin: adminButtons, judge: judgeButtons, user: userButtons },
            entryExceptions, paymentExceptions, judgingExceptions,
        });
    } catch (err) {
        next(err);
    }
});

// ── POST /formAdmin ────────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = await Program.findByPk(user.programid);
        const body    = req.body;

        // Rebuild menus
        const adminMenuId = await upsertTopMenu(program.adminmenu, 'admin', body);
        const judgeMenuId = await upsertTopMenu(program.judgemenu, 'judge', body);
        const userMenuId  = await upsertTopMenu(program.usermenu,  'user',  body);

        // Boolean fields
        const boolField = (key) => body[key] ? 1 : 0;

        await program.update({
            name:                    body.name                    || program.name,
            portalopen:              boolField('portalopen'),
            entriesopendefault:      boolField('entriesopen'),
            paymentsopendefault:     boolField('paymentsopen'),
            judgingopendefault:      boolField('judgingopen'),
            finalistlistavailable:   boolField('finalistlistavailable'),
            finalistscoresavailable: boolField('finalistscoresavailable'),
            nonfinalistscoresavailable: boolField('nonfinalistscoresavailable'),
            feedbackopen:            boolField('feedbackopen'),
            faveventavailable:       boolField('faveventavailable'),
            standardhtml:            body.standardhtml            || program.standardhtml,
            emailhtml:               body.emailhtml               || program.emailhtml,
            loginhtml:               body.loginhtml               || program.loginhtml,
            smtpserver:              body.smtpserver              || program.smtpserver,
            emailfromaddress:        body.emailfromaddress        || program.emailfromaddress,
            invoicenoprecursor:      body.invoicenoprecursor      || program.invoicenoprecursor,
            ewaycustomerno:          body.ewaycustomerno          || program.ewaycustomerno,
            ewaygatewayaddress:      body.ewaygatewayaddress      || program.ewaygatewayaddress,
            loginpagetext:           body.loginpagetext,
            invoicefromtext:         body.invoicefromtext,
            paymentinstructionstext: body.paymentinstructionstext,
            remittanceadvicetext:    body.remittanceadvicetext,
            receipttext:             body.receipttext,
            adminmenu:               adminMenuId,
            judgemenu:               judgeMenuId,
            usermenu:                userMenuId,
            admindescriptiontext:    body.admindescriptiontext,
            adminwelcometext:        body.adminwelcometext,
            judgedescriptiontext:    body.judgedescriptiontext,
            judgewelcometext:        body.judgewelcometext,
            finalistdescriptiontext: body.finalistdescriptiontext,
            finalistwelcometext:     body.finalistwelcometext,
            nonfinalistwelcometext:  body.nonfinalistwelcometext,
            standarddescriptiontext: body.standarddescriptiontext,
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
                .input('entriesopen', sql.Int, boolField('entriesopen'))
                .input('programid',   sql.Int, program.programid)
                .query(`UPDATE Category SET entriesopen = @entriesopen WHERE programid = @programid`);
            await pool.request()
                .input('judgingopen', sql.Int, boolField('judgingopen'))
                .input('programid',   sql.Int, program.programid)
                .query(`UPDATE Category SET judgingopen = @judgingopen WHERE programid = @programid`);
        }

        res.redirect('/home');
    } catch (err) {
        next(err);
    }
});

export default router;
