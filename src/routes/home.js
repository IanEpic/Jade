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
import JudgingModel from '../models/JudgingModel.js';
import Category from '../models/Category.js';
import User from '../models/User.js';
import ProgramDiscount from '../models/ProgramDiscount.js';
import Question from '../models/Question.js';
import Eligibility from '../models/Eligibility.js';
import Criteria from '../models/Criteria.js';
import CategoryQuestionLink from '../models/CategoryQuestionLink.js';
import CategoryEligibilityLink from '../models/CategoryEligibilityLink.js';


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
    getMenuButtonsForEdit,
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

async function loadJudgingModel(judgingmodelid) {
    if (!judgingmodelid) return {};
    const jm = await JudgingModel.findByPk(judgingmodelid);
    return jm ? jm.toJSON() : {};
}

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

// Equiv of $sidebar — builds nav panel tree for drill-down sidebar.
// Returns a dict of panels keyed by panel name. Each panel:
//   { items: [{href,label}|{submenu,label}], back?, backLabel? }
// The 'main' panel has no back. All others have back + backLabel.
async function buildSidebar(user, program, data) {
    const {
        allEntries, entrants, invoices, payments,
        catsOpenForEntries, afeNominees,
        finalistsNotOpen, nonFinalistsNotOpen, userPages,
    } = data;

    // ── Main panel ───────────────────────────────────────────────────────────
    const main = [];
    const addMain = (href, label) => main.push({ href, label });

    if (catsOpenForEntries.length)
        addMain('/home?action=newentry', 'New Entry');

    if (allEntries.length)
        addMain('/home?action=entries', 'My Entries');

    if (entrants.length && catsOpenForEntries.length) {
        const label = await translate(program.programid, 'My Entrants');
        addMain('/home?action=entrants', label);
    }

    if (invoices.length)
        addMain('/home?action=invoices', 'My Invoices');

    if (payments.length)
        addMain('/home?action=payments', 'My Payments');

    if (program.downloadpagehtml)
        addMain('/home?action=downloads', 'Downloads');

    if (afeNominees.length)
        addMain('/home?action=favouriteevent', "Australia's Favourite Event");

    const hasFinalistScores    = program.finalistscoresavailable && finalistsNotOpen.length;
    const hasNonFinalistScores = program.nonfinalistscoresavailable && nonFinalistsNotOpen.length;
    if (hasFinalistScores || hasNonFinalistScores)
        addMain('/home?action=scorescomments', 'Judge Comments');

    if (program.feedbackopen)
        addMain('/home?action=feedback', 'Leave Feedback');

    // Judge links
    if (user.judge) {
        const openLinks = await getEntriesAssignedToJudge({ userId: user.userid });
        if (openLinks.length)
            addMain('/home?action=tojudge', 'To Judge');
    }

    if (user.viewentries)
        addMain('/home?action=entrylist', 'View Entries');

    if (user.reviewer) {
        const openForReview = await getSimpleEntriesOpenForReview({ programId: program.programid });
        if (openForReview.length)
            addMain('/home?action=review', 'Review Entries');
    }

    if (user.simplejudge) {
        if (!user.onlyjudgepostreview) {
            const openForReview = await getSimpleEntriesOpenForReview({ programId: program.programid });
            if (openForReview.length)
                addMain('/home?action=simplejudge', 'Judge Entries');
        } else {
            const approved = await getSimpleEntriesApprovedByReviewer({ programId: program.programid });
            if (approved.length)
                addMain('/home?action=simplejudge', 'Judge Entries');
        }
    }

    if (user.judge) {
        const reviewCats = user.chairperson
            ? await getCatsOpenForReviewOrNomination({ programId: program.programid })
            : await getCatsOpenForReviewByJudge({ userId: user.userid });
        if (reviewCats.length)
            addMain('/home?action=reviewfinalists', 'Review Nominees');
    }

    for (const page of userPages) {
        if (
            (page.show4user) ||
            (page.show4judge && (user.judge || user.simplejudge)) ||
            (page.show4admin && user.admin)
        ) {
            main.push({ href: `/home?action=userpage&pid=${page.userpageid}`, label: page.name });
        }
    }

    // TODO: replace with program.showstats once that column is added to Program
    if (user.admin && program.programid === 1055)
        addMain('/home?action=stats', 'Stats');

    const panels = { main: { items: main } };

    // ── Admin panels (admin users only) ──────────────────────────────────────
    if (user.admin) {
        main.push({ submenu: 'admin', label: 'Admin' });

        const judgingItems = [{ href: '/home?action=judges', label: 'Judges' }];
        if (!program.usesimplejudging)
            judgingItems.push({ href: '/home?action=allocatejudges', label: 'Allocate Judges' });
        judgingItems.push({ href: '/home?action=emailjudges', label: 'Email Judges' });
        if (!program.usesimplejudging)
            judgingItems.push({ href: '/home?action=judgecheck', label: 'Check Judging' });

        panels.admin = {
            back: 'main', backLabel: '< Main Menu',
            items: [
                { href: '/home?action=program', label: 'Program' },
                { submenu: 'setup',    label: 'Setup' },
                { submenu: 'judging',  label: 'Judging' },
                { submenu: 'adminpay', label: 'Payments' },
                { submenu: 'tools',    label: 'Tools' },
                { submenu: 'reports',  label: 'Reports' },
            ],
        };
        panels.setup = {
            back: 'admin', backLabel: '< Admin',
            items: [
                { href: '/home?action=discounts',           label: 'Discounts' },
                { href: '/home?action=categories',          label: 'Categories' },
                { href: '/home?action=eligibility',         label: 'Eligibility' },
                { href: '/home?action=questions&type=entry', label: 'Questions' },
                { href: '/home?action=userpages',           label: 'User Pages' },
            ],
        };
        panels.judging = {
            back: 'admin', backLabel: '< Admin',
            items: judgingItems,
        };
        panels.adminpay = {
            back: 'admin', backLabel: '< Admin',
            items: [
                { href: '#', label: 'Receive Payment' },
                { href: '#', label: 'Create Invoice' },
                { href: '#', label: 'Issue Refund' },
            ],
        };
        panels.tools = {
            back: 'admin', backLabel: '< Admin',
            items: [
                { href: '#', label: 'Export PR Info' },
                { href: '#', label: 'Calc Final Scores' },
                { href: '#', label: 'Create Category' },
            ],
        };
        panels.reports = {
            back: 'admin', backLabel: '< Admin',
            items: [
                { href: '#', label: 'Active Users' },
                { href: '#', label: 'Finalised Unpaid' },
                { href: '#', label: 'Paid Unfinalised' },
            ],
        };
    }

    return panels;
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
        const sidebarMenus = await buildSidebar(user, program, data);

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
            if (action === 'program') {
                const isEntriesOpenDefault  = !!program.entriesopendefault;
                const isPaymentsOpenDefault = !!program.paymentsopendefault;
                const isJudgingOpenDefault  = !!program.judgingopendefault;
                const [[adminButtons, judgeButtons, userButtons], entryExceptions, paymentExceptions, judgingExceptions] = await Promise.all([
                    Promise.all([
                        getMenuButtonsForEdit({ topMenuId: program.adminmenu }),
                        getMenuButtonsForEdit({ topMenuId: program.judgemenu }),
                        getMenuButtonsForEdit({ topMenuId: program.usermenu }),
                    ]),
                    Category.findAll({ where: { programid: program.programid, entriesopen: isEntriesOpenDefault ? 0 : 1 } }),
                    User.findAll({     where: { programid: program.programid, paymentsopen: isPaymentsOpenDefault ? 0 : 1 } }),
                    Category.findAll({ where: { programid: program.programid, judgingopen: isJudgingOpenDefault ? 0 : 1 } }),
                ]);
                content = {
                    view: 'home/program',
                    menuButtons: { admin: adminButtons, judge: judgeButtons, user: userButtons },
                    entryExceptions, paymentExceptions, judgingExceptions,
                    error: null,
                    saved: req.query.saved === '1',
                };
            }
            else if (action === 'discounts') {
                const { edit: editId, delete: deleteId } = req.query;
                if (deleteId) {
                    await ProgramDiscount.destroy({ where: { discountid: parseInt(deleteId), programid: program.programid } });
                    return res.redirect('/home?action=discounts');
                }
                let editing = null;
                if (editId) {
                    editing = await ProgramDiscount.findOne({ where: { discountid: parseInt(editId), programid: program.programid } });
                }
                const discounts = await ProgramDiscount.findAll({
                    where: { programid: program.programid },
                    order: [['type', 'ASC'], ['discountid', 'ASC']],
                });
                const formatDate = (val) => {
                    if (!val) return '';
                    const d = new Date(val);
                    if (isNaN(d)) return '';
                    const pad = n => String(n).padStart(2, '0');
                    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
                };
                content = {
                    view: 'home/discounts',
                    discounts, editing, formatDate,
                    error:   req.query.error   || null,
                    success: req.query.success === '1',
                };
            }
            else if (action === 'category') {
                const categoryid = req.query.categoryid ? parseInt(req.query.categoryid) : null;
                const deletecriteria = req.query.deletecriteria ? parseInt(req.query.deletecriteria) : null;

                if (deletecriteria && categoryid) {
                    await Criteria.destroy({ where: { criteriaid: deletecriteria } });
                    return res.redirect(`/home?action=category&categoryid=${categoryid}`);
                }

                let category = null, criteria = [], questions = [], eligibilities = [];
                if (categoryid) {
                    category = await Category.findByPk(categoryid);
                    if (!category) return next(Object.assign(new Error('Category not found'), { status: 404 }));
                    const allQuestions = await Question.findAll({
                        where: { programid: program.programid, deleted: false },
                        order: [['orda', 'ASC'], ['questionid', 'ASC']],
                    });
                    const qLinks = await CategoryQuestionLink.findAll({ where: { categoryid }, order: [['orda', 'ASC'], ['questionid', 'ASC']] });
                    const qLinkMap = new Map(qLinks.map(l => [l.questionid, l]));
                    const linkedQs   = qLinks.map(l => {
                        const q = allQuestions.find(q => q.questionid === l.questionid);
                        return q ? { ...q.toJSON(), linked: true, linkOrda: l.orda } : null;
                    }).filter(Boolean);
                    const unlinkedQs = allQuestions.filter(q => !qLinkMap.has(q.questionid)).map(q => ({ ...q.toJSON(), linked: false }));
                    questions = [...linkedQs, ...unlinkedQs];

                    const allEligibilities = await Eligibility.findAll({
                        where: { programid: program.programid, deleted: false },
                        order: [['orda', 'ASC'], ['eligibilityid', 'ASC']],
                    });
                    const eLinks = await CategoryEligibilityLink.findAll({ where: { categoryid }, order: [['orda', 'ASC'], ['eligibilityid', 'ASC']] });
                    const eLinkMap = new Map(eLinks.map(l => [l.eligibilityid, l]));
                    const linkedEs   = eLinks.map(l => {
                        const e = allEligibilities.find(e => e.eligibilityid === l.eligibilityid);
                        return e ? { ...e.toJSON(), linked: true, linkOrda: l.orda } : null;
                    }).filter(Boolean);
                    const unlinkedEs = allEligibilities.filter(e => !eLinkMap.has(e.eligibilityid)).map(e => ({ ...e.toJSON(), linked: false }));
                    eligibilities = [...linkedEs, ...unlinkedEs];

                    criteria = await Criteria.findAll({ where: { categoryid }, order: [['orda', 'ASC'], ['criteriaid', 'ASC']] });
                }

                content = {
                    view: 'home/category',
                    category: category ? category.toJSON() : null,
                    criteria, questions, eligibilities,
                    isNew: !categoryid,
                    saved: req.query.saved === '1',
                };
            }
            else if (action === 'categories') {
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
                const judgingModel = await loadJudgingModel(program.judgingmodelid);
                const catData = await Promise.all(cats.map(async cat => {
                    const catJudges  = await getJudgesForCategory({ categoryId: cat.categoryid });
                    const criteria   = await getCriteriaForCategory({ categoryId: cat.categoryid });
                    const judgeData  = await Promise.all(catJudges.map(async judge => {
                        const entries = await getEntriesAssignedToJudge({ userId: judge.userid });
                        const catEntries = entries.filter(e => e.categoryid === cat.categoryid);
                        const entryData = await Promise.all(catEntries.map(async entry => {
                            const scores   = (await Promise.all(
                                criteria.filter(c => c.weight).map(c =>
                                    getScoreForEntryCriteriaJudge({
                                        entryId:    entry.entryid,
                                        criteriaId: c.criteriaid,
                                        userId:     judge.userid,
                                    })
                                )
                            )).filter(Boolean);
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
                const judgingModel = await loadJudgingModel(program.judgingmodelid);
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
                const judgingModel = await loadJudgingModel(program.judgingmodelid);
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
            sidebarMenus,
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
