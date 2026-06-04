// routes/home.js
// Express equivalent of home.cgi.
//
// Single GET /home route dispatches to sub-views based on ?action=
// Role priority (first match wins): admin → judge → viewentries → entrant
// Phase branching is handled inside defaultContent() and the sidebar.
//
// Layout: every response is renderInShell('home', locals) which injects
// home-content.pug into the legacy HTML shell via <CGIINSERT>.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { translate } from '../services/translate.js';
import { currency } from '../services/helpers.js';

import {
    getEntrantsByUser,
    getAllEntriesByUser,
    getAcceptedEntriesByUser,
    getNonFinalistEntriesByUser,
    getEntriesOpenByOverride,
    getInvoicesByUser,
    getPaymentsByUser,
    getPaymentsForInvoice,
    getCategoriesOpenForEntries,
    getCategoriesOpenForJudging,
    getAllCategories,
    getCatsOpenForReviewByJudge,
    getCatsOpenForReviewOrNomination,
    getCatsOpenForJudgingByJudge,
    getJudgeCommentsForProgram,
    getFinalScoresForEntries,
    getFinalScoreForEntry,
    getScoresForEntryByJudge,
    getAllEntriesForProgram,
    getFinalistsForProgram,
    getJudgesForProgram,
    getAllUsersForProgram,
    getEnabledJudgesForProgram,
    getQuestionsByType,
    getEligibilitiesByProgram,
    getUserPagesByProgram,
    getUserPageById,
    getTopMenuWithButtons,
    getJudgesForCategory,
    getEntriesAssignedToJudge,
    getCriteriaForCategory,
    getScoreForEntryCriteriaJudge,
    getJudgeCommentsForEntry,
    getJudgeCommentsForEntryByJudge,
    getWildcardNominationsByJudge,
    getEntryStats,
} from '../queries/homeQueries.js';

import {
    getFinalistsNotOpenByUser,
    getNonFinalistsNotOpenByUser,
    getSimpleEntriesOpenForReview,
    getSimpleEntriesApprovedByReviewer,
    getAfeNomineesByUser,
    getEntriesToBeJudgedByJudge,
    getNonFinalistsByJudgeAndCat,
    getEntriesNominatedForReviewByCat,
} from '../queries/entryQueries.js';

const router = Router();
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────────────────────
// Data helpers
// These mirror the $get* coderefs in home.cgi, called lazily there,
// called explicitly here before rendering.
// ─────────────────────────────────────────────────────────────────────────────

async function loadCommonData(user) {
    const programId = user.programid;
    const userId    = user.userid;

    const [
        allEntries,
        acceptedEntries,
        entrants,
        invoices,
        payments,
        catsOpenForEntries,
        afeNominees,
        finalistsNotOpen,
        nonFinalistsNotOpen,
        userPages,
    ] = await Promise.all([
        getAllEntriesByUser({ userId }),
        getAcceptedEntriesByUser({ userId }),
        getEntrantsByUser({ userId }),
        getInvoicesByUser({ userId }),
        getPaymentsByUser({ userId }),
        getCategoriesOpenForEntries({ programId }),
        getAfeNomineesByUser({ userId }),
        getFinalistsNotOpenByUser({ userId }),
        getNonFinalistsNotOpenByUser({ userId }),
        getUserPagesByProgram({ programId }),
    ]);

    return {
        allEntries,
        acceptedEntries,
        entrants,
        invoices,
        payments,
        catsOpenForEntries,
        afeNominees,
        finalistsNotOpen,
        nonFinalistsNotOpen,
        userPages,
    };
}

// Equiv of $top — description text shown above the menu bar
function getTopText(user, program, hasFinalists) {
    if (user.judge)  return program.judgedescriptiontext  || '';
    if (user.admin)  return program.admindescriptiontext  || '';
    if (hasFinalists) return program.finalistdescriptiontext || '';
    return program.standarddescriptiontext || '';
}

// Equiv of $defaulttext — welcome text shown when no ?action=
async function getDefaultContent(user, program, data) {
    const { acceptedEntries, finalistsNotOpen } = data;

    // Judge branch
    if (user.judge) {
        const catsForJudging = await getCatsOpenForJudgingByJudge({ userId: user.userid });
        if (program.judgingopendefault || catsForJudging.length) {
            return { view: 'home/welcome', text: program.judgewelcometext || '' };
        }
    }
    // Reviewer / simplejudge
    if (user.reviewer || user.simplejudge) {
        return { view: 'home/welcome', text: program.judgewelcometext || '' };
    }
    // Admin
    if (user.admin) {
        return { view: 'home/welcome', text: program.adminwelcometext || '' };
    }
    // Entrant — finalist list available and has accepted entries
    if (program.finalistlistavailable && acceptedEntries.length) {
        return { view: 'home/finalisttext', entries: acceptedEntries, program };
    }
    // Default entrant welcome
    return { view: 'home/welcome', text: program.standardwelcometext || '' };
}

// Equiv of $sidebar — builds nav link list
async function buildSidebar(user, program, data) {
    const {
        allEntries, entrants, invoices, payments,
        catsOpenForEntries, afeNominees,
        finalistsNotOpen, nonFinalistsNotOpen, userPages,
    } = data;

    const links = [];
    const add = (href, label) => links.push({ href, label });

    if (catsOpenForEntries.length)
        add('/home?action=newentry', 'New Entry');

    if (allEntries.length)
        add('/home?action=entries', 'My Entries');

    if (entrants.length && catsOpenForEntries.length) {
        const label = await translate(program.programid, 'My Entrants');
        add('/home?action=entrants', label);
    }

    if (invoices.length)
        add('/home?action=invoices', 'My Invoices');

    if (program.downloadpagehtml)
        add('/home?action=downloads', 'Downloads');

    if (afeNominees.length)
        add('/home?action=favouriteevent', "Australia's Favourite Event");

    const hasFinalistScores    = program.finalistscoresavailable && finalistsNotOpen.length;
    const hasNonFinalistScores = program.nonfinalistscoresavailable && nonFinalistsNotOpen.length;
    if (hasFinalistScores || hasNonFinalistScores)
        add('/home?action=scorescomments', 'Judge Comments');

    if (program.feedbackopen)
        add('/home?action=feedback', 'Leave Feedback');

    if (payments.length)
        add('/home?action=payments', 'My Payments');

    // Admin-only links
    if (user.admin) {
        add('/formDiscount',               'Discounts');
        add('/home?action=eligibility',    'Eligibility');
        add('/home?action=categories',     'Categories');
        add('/home?action=questions&type=entry', 'Questions');
        add('/home?action=userpages',      'User Pages');
        add('/home?action=judges',         'Judges');
        if (!program.usesimplejudging)
            add('/home?action=allocatejudges', 'Allocate Judges');
        add('/home?action=emailjudges',    'Email Judges');
        if (!program.usesimplejudging)
            add('/home?action=judgecheck', 'Check Judging');
    }

    // Judge judging links
    if (user.judge) {
        const openLinks = await getEntriesAssignedToJudge({ userId: user.userid });
        if (openLinks.length)
            add('/home?action=tojudge', 'To Judge');
    }

    // View entries
    if (user.viewentries)
        add('/home?action=entrylist', 'View Entries');

    // Reviewer
    if (user.reviewer) {
        const openForReview = await getSimpleEntriesOpenForReview({ programId: program.programid });
        if (openForReview.length)
            add('/home?action=review', 'Review Entries');
    }

    // Simple judge
    if (user.simplejudge) {
        if (!user.onlyjudgepostreview) {
            const openForReview = await getSimpleEntriesOpenForReview({ programId: program.programid });
            if (openForReview.length)
                add('/home?action=simplejudge', 'Judge Entries');
        } else {
            const approved = await getSimpleEntriesApprovedByReviewer({ programId: program.programid });
            if (approved.length)
                add('/home?action=simplejudge', 'Judge Entries');
        }
    }

    // Finalist review for judges
    if (user.judge) {
        const reviewCats = user.chairperson
            ? await getCatsOpenForReviewOrNomination({ programId: program.programid })
            : await getCatsOpenForReviewByJudge({ userId: user.userid });
        if (reviewCats.length)
            add('/home?action=reviewfinalists', 'Review Nominees');
    }

    // User pages (conditional visibility)
    for (const page of userPages) {
        if (
            (page.show4user) ||
            (page.show4judge && (user.judge || user.simplejudge)) ||
            (page.show4admin && user.admin)
        ) {
            links.push({ href: `/home?action=userpage&pid=${page.userpageid}`, label: page.name });
        }
    }

    // TODO: replace with program.showstats once that boolean column is added to
    //       the Program table and deployed. See homeQueries.js for instructions.
    if (user.admin && program.programid === 1055)
        add('/home?action=stats', 'Stats');

    if (user.admin)
        add('/admin', 'Admin');

    return links;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /home
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;
        const action  = req.query.action || '';
        const type    = req.query.type   || '';
        const pid     = req.query.pid    || '';

        // Load data common to all roles
        const data = await loadCommonData(user);

        // ── Resolve top-menu buttons ────────────────────────────────────────
        let menuButtons = [];
        if (user.admin) {
            menuButtons = await getTopMenuWithButtons({ topMenuId: program.adminmenu });
        } else if (user.judge || user.viewentries) {
            menuButtons = await getTopMenuWithButtons({ topMenuId: program.judgemenu });
        } else {
            menuButtons = await getTopMenuWithButtons({ topMenuId: program.usermenu });
        }

        // ── Build sidebar ───────────────────────────────────────────────────
        const sidebarLinks = await buildSidebar(user, program, data);

        // ── Resolve content section ─────────────────────────────────────────
        let content = {};   // { view, ...viewData }

        // ── Shared action routing (all roles) ─────────────────────────────
        if (action === 'entrylist' && (user.admin || user.viewentries)) {
            const entries = await getAllEntriesForProgram({ programId: program.programid });
            content = { view: 'home/entrylist', entries, translate };
        }
        else if (action === 'entries') {
            const overrideOpen = await getEntriesOpenByOverride({ userId: user.userid });
            content = {
                view:             'home/entries',
                entries:          data.allEntries,
                catsOpenForEntries: data.catsOpenForEntries,
                overrideOpen,
                program,
                user,
                translate,
                currency,
            };
        }
        else if (action === 'newentry') {
            content = {
                view:    'home/newentry',
                cats:    data.catsOpenForEntries,
                program,
                currency,
            };
        }
        else if (action === 'entrants') {
            const overrideOpen = await getEntriesOpenByOverride({ userId: user.userid });
            content = {
                view:             'home/entrants',
                entrants:         data.entrants,
                catsOpenForEntries: data.catsOpenForEntries,
                overrideOpen,
                program,
                translate,
            };
        }
        else if (action === 'invoices') {
            // Hydrate payments for each invoice to get balance
            const invoicesWithPayments = await Promise.all(
                data.invoices.map(async inv => {
                    const pmts = await getPaymentsForInvoice({ invoiceId: inv.invoiceid });
                    const paid = pmts.reduce((sum, p) => sum + (parseFloat(p.allocatedamount) || 0), 0);
                    return { ...inv, paid, balance: (inv.totalamt || 0) - paid };
                })
            );
            const overrideOpen = await getEntriesOpenByOverride({ userId: user.userid });
            content = {
                view:     'home/invoices',
                invoices: invoicesWithPayments,
                catsOpenForEntries: data.catsOpenForEntries,
                overrideOpen,
                currency,
            };
        }
        else if (action === 'payments') {
            content = {
                view:     'home/payments',
                payments: data.payments,
                program,
                currency,
            };
        }
        else if (action === 'downloads') {
            content = {
                view: 'home/downloads',
                html: program.downloadpagehtml || '',
            };
        }
        else if (action === 'userpage') {
            const page = await getUserPageById({ pageId: pid });
            content = { view: 'home/userpage', html: page?.html || '' };
        }
        else if (action === 'feedback') {
            content = {
                view:    'home/feedback',
                program,
                user,
            };
        }
        else if (action === 'finalists' && !user.feedbackleft) {
            content = {
                view:    'home/feedback',
                program,
                user,
            };
        }
        else if (action === 'finalists' && user.feedbackleft) {
            content = {
                view:    'home/finalisttext',
                entries: data.acceptedEntries,
                program,
            };
        }
        else if (action === 'scorescomments') {
            const scoredEntries = [];
            if (program.finalistscoresavailable) {
                scoredEntries.push(...data.finalistsNotOpen);
            }
            if (program.nonfinalistscoresavailable) {
                scoredEntries.push(...data.nonFinalistsNotOpen);
            }
            const entriesWithData = await Promise.all(
                scoredEntries.map(async e => {
                    const finalScore = await getFinalScoreForEntry({ entryId: e.entryid });
                    const comments   = await getJudgeCommentsForEntry({ entryId: e.entryid });
                    return { ...e, finalScore, comments };
                })
            );
            content = {
                view:    'home/scorescomments',
                entries: entriesWithData,
                program,
                currency,
            };
        }
        else if (action === 'catcost') {
            const cats = await getAllCategories({ programId: program.programid });
            content = { view: 'home/catcost', cats, program, currency };
        }
        else if (action === 'favouriteevent') {
            content = {
                view:         'home/favouriteevent',
                afeNominees:  data.afeNominees,
                submitted:    req.query.submit || '',
            };
        }
        else if (action === 'tc' && !user.judge) {
            content = { view: 'home/tc', program };
        }
        else if (action === 'help' && !user.judge) {
            content = { view: 'home/help', program };
        }
        else if ((action === 'simplejudge' && user.simplejudge) ||
                 (action === 'review'      && user.reviewer)) {
            const isReview = action === 'review';
            const entries = isReview
                ? await getSimpleEntriesOpenForReview({ programId: program.programid })
                : await getSimpleEntriesApprovedByReviewer({ programId: program.programid });
            const judgeComments = await getJudgeCommentsForProgram({ programId: program.programid });
            content = {
                view:         'home/simplereviewjudge',
                title:        isReview ? 'Review Entries' : 'Entries Approved by Reviewer',
                entries,
                judgeComments,
                user,
                translate,
            };
        }

        // ── Admin-only actions ────────────────────────────────────────────
        if (user.admin) {
            if (action === 'categories') {
                const cats = await getAllCategories({ programId: program.programid });
                content = { view: 'home/categories', cats, currency };
            }
            else if (action === 'questions') {
                const questions = await getQuestionsByType({ programId: program.programid, questionType: type });
                content = { view: 'home/questions', questions, type };
            }
            else if (action === 'eligibility') {
                const eligibilities = await getEligibilitiesByProgram({ programId: program.programid });
                content = { view: 'home/eligibility', eligibilities };
            }
            else if (action === 'userpages') {
                const pages = await getUserPagesByProgram({ programId: program.programid });
                content = { view: 'home/userpages', pages };
            }
            else if (action === 'judges') {
                const judges = await getJudgesForProgram({
                    programId: program.programid,
                    useSimplejudging: program.usesimplejudging,
                });
                content = { view: 'home/judges', judges };
            }
            else if (action === 'allocatejudges') {
                const cats   = await getAllCategories({ programId: program.programid });
                const judges = await getJudgesForProgram({
                    programId: program.programid,
                    useSimplejudging: program.usesimplejudging,
                });
                // For each cat, get its judges and accepted entries
                const catData = await Promise.all(cats.map(async cat => {
                    const catJudges  = await getJudgesForCategory({ categoryId: cat.categoryid });
                    const catEntries = (await getAllEntriesForProgram({ programId: program.programid }))
                        .filter(e => e.categoryid === cat.categoryid && e.entryaccepted);
                    return { ...cat, judges: catJudges, entries: catEntries };
                }));
                content = { view: 'home/allocatejudges', cats: catData, allJudges: judges, translate };
            }
            else if (action === 'emailjudges') {
                const judges = await getEnabledJudgesForProgram({
                    programId: program.programid,
                    useSimplejudging: program.usesimplejudging,
                });
                content = { view: 'home/emailjudges', judges, program };
            }
            else if (action === 'judgecheck') {
                const cats = await getAllCategories({ programId: program.programid });
                const judgingModel = program.judgingmodel || {};
                const catData = await Promise.all(cats.map(async cat => {
                    const catJudges  = await getJudgesForCategory({ categoryId: cat.categoryid });
                    const criteria   = await getCriteriaForCategory({ categoryId: cat.categoryid });
                    const judgeData  = await Promise.all(catJudges.map(async judge => {
                        const entries = await getEntriesAssignedToJudge({ userId: judge.userid });
                        const catEntries = entries.filter(e => e.categoryid === cat.categoryid);
                        const entryData = await Promise.all(catEntries.map(async entry => {
                            const scores   = await Promise.all(
                                criteria.filter(c => c.weight).map(c =>
                                    getScoreForEntryCriteriaJudge({
                                        entryId:    entry.entryid,
                                        criteriaId: c.criteriaid,
                                        userId:     judge.userid,
                                    })
                                )
                            );
                            const comments = await getJudgeCommentsForEntryByJudge({
                                entryId: entry.entryid,
                                userId:  judge.userid,
                            });
                            return { ...entry, scores, comments };
                        }));
                        return { ...judge, entries: entryData };
                    }));
                    return { ...cat, judges: judgeData, criteria };
                }));
                content = { view: 'home/judgecheck', cats: catData, judgingModel };
            }
            else if (action === 'users') {
                const users = await getAllUsersForProgram({ programId: program.programid });
                content = { view: 'home/users', users };
            }
            else if (action === 'tojudge') {
                const entries = await getEntriesToBeJudgedByJudge({ userId: user.userid });
                const judgingModel = program.judgingmodel || {};
                const entryData = await Promise.all(entries.map(async e => {
                    const criteria = await getCriteriaForCategory({ categoryId: e.categoryid });
                    const scores   = await getScoresForEntryByJudge({ entryId: e.entryid, userId: user.userid });
                    const comments = await getJudgeCommentsForEntryByJudge({ entryId: e.entryid, userId: user.userid });
                    return { ...e, criteria, scores, comments };
                }));
                content = { view: 'home/tojudge', entries: entryData, judgingModel, user, translate };
            }
            else if (action === 'reviewfinalists') {
                const cats = user.chairperson
                    ? await getCatsOpenForReviewOrNomination({ programId: program.programid })
                    : await getCatsOpenForReviewByJudge({ userId: user.userid });
                const catData = await Promise.all(cats.map(async cat => {
                    const finalists    = (await getAllEntriesForProgram({ programId: program.programid }))
                        .filter(e => e.categoryid === cat.categoryid && e.finalist);
                    const nonFinalists = await getNonFinalistsByJudgeAndCat({ userId: user.userid, categoryId: cat.categoryid });
                    const nominated    = await getEntriesNominatedForReviewByCat({ categoryId: cat.categoryid });
                    const entryIds     = [...finalists, ...nonFinalists, ...nominated].map(e => e.entryid);
                    const finalScores  = entryIds.length
                        ? await getFinalScoresForEntries({ entryIds })
                        : [];
                    return { ...cat, finalists, nonFinalists, nominated, finalScores };
                }));
                content = { view: 'home/reviewfinalists', cats: catData, user, translate };
            }
            else if (action === 'wildcardnomination') {
                const cats = user.chairperson
                    ? await getCatsOpenForReviewOrNomination({ programId: program.programid })
                    : await getCatsOpenForReviewByJudge({ userId: user.userid });
                const wildcardNoms = await getWildcardNominationsByJudge({ userId: user.userid });
                const catData = await Promise.all(cats.map(async cat => {
                    const nonFinalists = await getNonFinalistsByJudgeAndCat({ userId: user.userid, categoryId: cat.categoryid });
                    return { ...cat, nonFinalists };
                }));
                content = { view: 'home/wildcardnomination', cats: catData, wildcardNoms, translate };
            }
            else if (action === 'finalistentries') {
                const entries = await getFinalistsForProgram({ programId: program.programid });
                content = { view: 'home/finalistentries', entries, translate };
            }
            else if (action === 'stats') {
                const stats = await getEntryStats();
                content = { view: 'home/stats', stats };
            }
        }

        // ── Judge-specific actions ────────────────────────────────────────
        if (user.judge) {
            if (action === 'tojudge') {
                const entries = await getEntriesToBeJudgedByJudge({ userId: user.userid });
                const judgingModel = program.judgingmodel || {};
                const entryData = await Promise.all(entries.map(async e => {
                    const criteria = await getCriteriaForCategory({ categoryId: e.categoryid });
                    const scores   = await getScoresForEntryByJudge({ entryId: e.entryid, userId: user.userid });
                    const comments = await getJudgeCommentsForEntryByJudge({ entryId: e.entryid, userId: user.userid });
                    return { ...e, criteria, scores, comments };
                }));
                content = { view: 'home/tojudge', entries: entryData, judgingModel, user, translate };
            }
            else if (action === 'reviewfinalists') {
                const cats = user.chairperson
                    ? await getCatsOpenForReviewOrNomination({ programId: program.programid })
                    : await getCatsOpenForReviewByJudge({ userId: user.userid });
                const catData = await Promise.all(cats.map(async cat => {
                    const finalists    = (await getFinalistsForProgram({ programId: program.programid }))
                        .filter(e => e.categoryid === cat.categoryid);
                    const nonFinalists = await getNonFinalistsByJudgeAndCat({ userId: user.userid, categoryId: cat.categoryid });
                    const nominated    = await getEntriesNominatedForReviewByCat({ categoryId: cat.categoryid });
                    const entryIds     = [...finalists, ...nonFinalists, ...nominated].map(e => e.entryid);
                    const finalScores  = entryIds.length
                        ? await getFinalScoresForEntries({ entryIds })
                        : [];
                    return { ...cat, finalists, nonFinalists, nominated, finalScores };
                }));
                content = { view: 'home/reviewfinalists', cats: catData, user, translate };
            }
            else if (action === 'wildcardnomination') {
                const cats = user.chairperson
                    ? await getCatsOpenForReviewOrNomination({ programId: program.programid })
                    : await getCatsOpenForReviewByJudge({ userId: user.userid });
                const wildcardNoms = await getWildcardNominationsByJudge({ userId: user.userid });
                const catData = await Promise.all(cats.map(async cat => {
                    const nonFinalists = await getNonFinalistsByJudgeAndCat({ userId: user.userid, categoryId: cat.categoryid });
                    return { ...cat, nonFinalists };
                }));
                content = { view: 'home/wildcardnomination', cats: catData, wildcardNoms, translate };
            }
            else if (action === 'tc') {
                content = { view: 'home/judgetc', program };
            }
            else if (action === 'contacts') {
                content = { view: 'home/judgecontacts', program };
            }
            else if (action === 'help') {
                content = { view: 'home/judgehelp', program };
            }
            else if (action === 'judgetcerror') {
                content = { view: 'home/judgetc', program, error: true };
            }
            else if (action === 'finalistentries') {
                const entries = await getFinalistsForProgram({ programId: program.programid });
                content = { view: 'home/finalistentries', entries, translate };
            }
        }

        else if (action === 'switchProgram') {
            content = { view: 'home/switchProgram', linkedPrograms: req.session.linkedPrograms || [], currentProgramId: program.programid };
        }

        // ── Default content (no action matched or no action param) ─────────
        if (!content.view) {
            content = await getDefaultContent(user, program, data);
        }

        // ── Top text (description bar above menu) ──────────────────────────
        const topText = getTopText(user, program, data.finalistsNotOpen.length > 0);

        // ── Emulation flag ─────────────────────────────────────────────────
        const isEmulating = !!req.session.emulateUserId;

        res.renderInShell('home', {
            user,
            program,
            topText,
            menuButtons,
            sidebarLinks,
            content,
            isEmulating,
            action,
            linkedPrograms:   req.session.linkedPrograms || [],
            currentProgramId: program.programid,
        });

    } catch (err) {
        next(err);
    }
});

export default router;
