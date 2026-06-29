// routes/program.js
// Sub-router mounted at /:slug in app.js.
// All program-scoped routes live here — req.program is already set by
// the resolveProgram middleware before this router runs.

import { Router } from 'express';
import path from 'path';
import fs   from 'fs';

import entryRouter            from './entry.js';
import loginRouter            from './login.js';
import homeRouter             from './home.js';
import formEntrantRouter      from './formEntrant.js';
import tcRouter               from './tc.js';
import formEntryRouter        from './formEntry.js';
import viewEntryRouter        from './viewEntry.js';
import formPaymentOptionsRouter from './formPaymentOptions.js';
import formAdminRouter        from './formAdmin.js';
import formCategoryRouter     from './formCategory.js';
import formUserRouter         from './formUser.js';
import registerRouter         from './register.js';
import formInvoiceRouter      from './formInvoice.js';
import formPaymentRouter      from './formPayment.js';
import formResponsesRouter    from './formResponses.js';
import formQuestionRouter     from './formQuestion.js';
import recordScoresRouter     from './recordScores.js';
import simpleReviewRouter     from './simpleReview.js';
import finaliseEntryRouter    from './finaliseEntry.js';
import formJudgeRouter        from './formJudge.js';
import judgeAllocationRouter  from './judgeAllocation.js';
import judgeEmailRouter       from './judgeEmail.js';
import judgeReworkRouter      from './judgeRework.js';
import judgetcRouter          from './judgetc.js';
import nominateWinnerRouter   from './nominatewinner.js';
import nominateWildcardRouter from './nominatewildcard.js';
import feedbackRouter         from './feedback.js';
import passwordResetRouter    from './passwordReset.js';
import changePasswordRouter   from './changePassword.js';
import activateRouter         from './activate.js';
import setPasswordRouter      from './setPassword.js';
import formEligibilityRouter  from './formEligibility.js';
import formPageRouter         from './formPage.js';
import explainscoresRouter    from './explainscores.js';
import viewPageRouter         from './viewPage.js';
import formDiscountRouter        from './formDiscount.js';
import checkCommentsRouter       from './checkComments.js';
import formEntryFlagsRouter      from './formEntryFlags.js';
import reportActiveUsersRouter    from './reportActiveUsers.js';
import reportAllEntryDataRouter   from './reportAllEntryData.js';
import reportResultsRouter        from './reportResults.js';
import reportFinalistsListRouter  from './reportFinalistsList.js';
import reportPaidNotFinalisedRouter from './reportPaidNotFinalised.js';
import reportFinalisedNotPaidRouter from './reportFinalisedNotPaid.js';
import reportEntriesByCategoryRouter from './reportEntriesByCategory.js';
import reportFinalistsRouter        from './reportFinalists.js';
import finalistTextRouter          from './finalistText.js';
import categoryTypesRouter         from './categoryTypes.js';
import receivePaymentRouter        from './receivePayment.js';
import bestStateRouter             from './bestState.js';
import voScriptRouter              from './voScript.js';
import citationRouter              from './citation.js';
import prExportRouter              from './prExport.js';
import cqDocsRouter                from './cqDocs.js';

const router = Router({ mergeParams: true });

// /:slug → redirect to /:slug/login
router.get('/', (req, res) => res.redirect('/login'));

// ── Public favicon ───────────────────────────────────────────────────────────
// Served without auth so the browser can display it on the login page and any
// other page where the user is not yet authenticated.
const FAVICONS_DIR = path.join(process.env.FILESTORE_ROOT || 'C:/Data/LocalJadeFilestore', 'favicons');
router.get('/admin/favicon', (req, res) => {
    const program = req.program;
    if (!program?.faviconfile) return res.status(404).end();
    const filePath = path.join(FAVICONS_DIR, String(program.programid), program.faviconfile);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.sendFile(filePath, err => { if (err && !res.headersSent) res.status(404).end(); });
});

// ── Session keep-alive ────────────────────────────────────────────────────────
// Called by client JS every 10 min. Resets the rolling session cookie.
// Returns 200 {ok:true} if logged in, 401 {ok:false} if session has expired.
router.get('/ping', (req, res) => {
    if (req.session?.userId) return res.json({ ok: true });
    res.status(401).json({ ok: false });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
router.use('/login',    loginRouter);

// ── Entry (legacy REST-style routes) ─────────────────────────────────────────
router.use('/entry',    entryRouter);

// ── Main routes ───────────────────────────────────────────────────────────────
router.use('/home',                homeRouter);
router.use('/formEntrant',         formEntrantRouter);
router.use('/tc',                  tcRouter);
router.use('/formEntry',           formEntryRouter);
router.use('/viewEntry',           viewEntryRouter);
router.use('/formPaymentOptions',  formPaymentOptionsRouter);
router.use('/admin',               formAdminRouter);
router.use('/formCategory',        formCategoryRouter);
router.use('/formUser',            formUserRouter);
router.use('/register',            registerRouter);
router.use('/formInvoice',         formInvoiceRouter);
router.use('/formPayment',         formPaymentRouter);
router.use('/formResponses',       formResponsesRouter);
router.use('/formQuestion',        formQuestionRouter);
router.use('/recordScores',        recordScoresRouter);
router.use('/checkComments',       checkCommentsRouter);
router.use('/simpleReview',        simpleReviewRouter);
router.use('/finaliseEntry',       finaliseEntryRouter);
router.use('/formJudge',           formJudgeRouter);
router.use('/judgeAllocation',     judgeAllocationRouter);
router.use('/judgeEmail',          judgeEmailRouter);
router.use('/judgeRework',         judgeReworkRouter);
router.use('/judgetc',             judgetcRouter);
router.use('/nominatewinner',      nominateWinnerRouter);
router.use('/nominatewildcard',    nominateWildcardRouter);
router.use('/feedback',            feedbackRouter);
router.use('/password-reset',      passwordResetRouter);
router.use('/change-password',     changePasswordRouter);
router.use('/activate',            activateRouter);
router.use('/set-password',        setPasswordRouter);
router.use('/formEligibility',     formEligibilityRouter);
router.use('/formPage',            formPageRouter);
router.use('/explainscores',       explainscoresRouter);
router.use('/viewPage',            viewPageRouter);
router.use('/formDiscount',        formDiscountRouter);
router.use('/formEntryFlags',      formEntryFlagsRouter);
router.use('/reportActiveUsers',      reportActiveUsersRouter);
router.use('/reportAllEntryData',     reportAllEntryDataRouter);
router.use('/reportResults',          reportResultsRouter);
router.use('/reportFinalistsList',    reportFinalistsListRouter);
router.use('/reportPaidNotFinalised', reportPaidNotFinalisedRouter);
router.use('/reportFinalisedNotPaid', reportFinalisedNotPaidRouter);
router.use('/reportEntriesByCategory', reportEntriesByCategoryRouter);
router.use('/reportFinalists',         reportFinalistsRouter);
router.use('/finalistText',            finalistTextRouter);
router.use('/categoryTypes',           categoryTypesRouter);
router.use('/receivePayment',          receivePaymentRouter);
router.use('/beststate',               bestStateRouter);
router.use('/voScript',                voScriptRouter);
router.use('/citation',                citationRouter);
router.use('/prExport',                prExportRouter);
router.use('/cqDocs',                  cqDocsRouter);

// ── Compatibility shims ───────────────────────────────────────────────────────
// Legacy .cgi URLs that may still appear in bookmarks.
router.get('/logout', (req, res) => res.redirect('/login/logout'));
router.get('/logout.cgi', (req, res) => res.redirect('/login/logout'));
router.get('/formUser.cgi', (req, res) =>
    res.redirect('/formUser' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''))
);
router.get('/response/:entryid/:page', (req, res) =>
    res.redirect(`/formResponses?entryid=${req.params.entryid}`)
);

// ── Emulation ─────────────────────────────────────────────────────────────────
router.get('/emulate', (req, res, next) => {
    const { userId } = req.query;
    if (!req.session?.userId) return res.redirect('/login');
    if (userId && req.session.adminUserId) {
        req.session.emulateUserId = parseInt(userId);
    } else if (userId) {
        req.session.adminUserId   = req.session.userId;
        req.session.emulateUserId = parseInt(userId);
    } else {
        req.session.emulateUserId = null;
    }
    // Persist the session before redirecting — the store is async (MssqlStore),
    // so without this the next GET /home can read the old session and miss the
    // emulation state until a manual refresh.
    req.session.save(err => {
        if (err) return next(err);
        res.redirect(`/${req.program.slug}/home`);
    });
});

export default router;
