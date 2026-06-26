// routes/home/adminActions.js
// Action handlers for admin-only /home?action= routes.
//
// Returns:
//   content object  → caller renders it
//   null            → redirect already sent
//   undefined       → action not matched here

import Category                from '../../models/Category.js';
import FinalScore              from '../../models/FinalScore.js';
import FinalScoreCriteria      from '../../models/FinalScoreCriteria.js';
import { calcFinalScores }     from '../../services/finalScores.js';
import { computeStateFinalists, writeStateFinalists, ensureEventStates, loadSavedStateFinalists } from '../../services/stateFinalists.js';
import sequelize               from '../../config/sequelize.js';
import User                    from '../../models/User.js';
import ProgramDiscount         from '../../models/ProgramDiscount.js';
import Question                from '../../models/Question.js';
import Eligibility             from '../../models/Eligibility.js';
import Criteria                from '../../models/Criteria.js';
import CategoryQuestionLink    from '../../models/CategoryQuestionLink.js';
import InputOption             from '../../models/InputOption.js';
import CategoryEligibilityLink from '../../models/CategoryEligibilityLink.js';
import UserPage                from '../../models/UserPage.js';
import Address                 from '../../models/Address.js';
import { loadAddressesForCredential } from '../../services/addressService.js';
import JudgeCategoryLink       from '../../models/JudgeCategoryLink.js';
import UserCredential          from '../../models/UserCredential.js';
import JudgingModel            from '../../models/JudgingModel.js';
import CategoryType            from '../../models/CategoryType.js';
import { currency, PASSWORD_RULES } from '../../services/helpers.js';
import { translate }           from '../../services/translate.js';
import { buildWinnerNomination } from './winnerNomination.js';
import {
    getAllCategories,
    getQuestionsByType,
    getEligibilitiesByProgram,
    getUserPagesByProgram,
    getJudgesForProgram,
    getEnabledJudgesForProgram,
    getJudgesForCategory,
    getAllEntriesForProgram,
    getCriteriaForCategory,
    getScoreForEntryCriteriaJudge,
    getJudgeCommentsForEntryByJudge,
    getJudgeEntryLink,
    getJudgeEntryLinksForCategory,
    getAllUsersForProgram,
    getActiveSessionUserIds,
    getEntryStats,
    getStatsPrograms,
    upsertStatsProgram,
    deleteStatsProgram,
    getEntriesAssignedToJudge,
    getEntriesByCategoryReport,
    getActiveUsersReport,
    getPaidNotFinalisedReport,
    getFinalisedNotPaidReport,
    getFinalistsForProgram,
    getOutstandingInvoices,
} from '../../queries/homeQueries.js';
import { getEarlyBirdDiscount, computeBestDiscount } from '../../services/pricing.js';
import { getReviewNominationsForProgram } from '../../queries/entryQueries.js';

async function loadJudgingModel(judgingmodelid) {
    if (!judgingmodelid) return {};
    const jm = await JudgingModel.findByPk(judgingmodelid);
    return jm ? jm.toJSON() : {};
}

export async function handleAdminAction(action, req, res, program, user) {

    if (action === 'nominatewinner') {
        return buildWinnerNomination({ program, user, saved: req.query.saved === '1' });
    }

    if (action === 'receivepayment') {
        // Outstanding invoices for admin to record EFT / card payments against.
        const raw = await getOutstandingInvoices({ programId: program.programid });
        const eb  = await getEarlyBirdDiscount(program.programid);
        const num = id => (program.invoicenoprecursor || '') + String(id).padStart(5, '0');
        const invoices = raw.map(r => {
            const full   = (+r.totalex || 0) + (+r.gst || 0) - (+r.partnerdiscount || 0)
                         - (+r.multientryadjustment || 0) - (+r.ebdiscount || 0);
            const ebDisc = eb ? (computeBestDiscount([eb], r.entrycount, full)?.discountInc || 0) : 0;
            const paid   = +r.paid || 0;
            return {
                invoiceid:  r.invoiceid,
                invoiceno:  num(r.invoiceid),
                entrant:    r.invoicee || `${r.firstname || ''} ${r.lastname || ''}`.trim() || r.organisation || ('User ' + r.userid),
                entrycount: r.entrycount,
                unaccepted: r.unaccepted,
                full:       +full.toFixed(2),
                ebDiscount: +ebDisc.toFixed(2),
                ebAmount:   +(full - ebDisc).toFixed(2),
                paid:       +paid.toFixed(2),
                balance:    +(full - paid).toFixed(2),
            };
        });
        const thisYear = new Date().getFullYear();
        return {
            view: 'home/receivepayment',
            invoices,
            ebDate:  eb?.validto ? new Date(eb.validto).toISOString().slice(0, 10) : null,
            today:   new Date().toISOString().slice(0, 10),
            ccYears: Array.from({ length: 11 }, (_, i) => thisYear + i),
            saved:   req.query.saved === '1',
            carderror: req.query.carderror || null,
            allocerror: req.query.allocerror === '1',
        };
    }

    if (action === 'categorytypes') {
        // Setup: create/rename/delete types + assign categories (no rules).
        const [types, categories] = await Promise.all([
            CategoryType.findAll({ where: { programid: program.programid, deleted: false }, order: [['orda', 'ASC']] }),
            Category.findAll({ where: { programid: program.programid, deleted: false }, order: [['orda', 'ASC'], ['categoryid', 'ASC']] }),
        ]);
        return {
            view: 'home/categorytypes',
            types:      types.map(t => ({ categorytypeid: t.categorytypeid, name: t.name })),
            categories: categories.map(c => ({ categoryid: c.categoryid, name: c.name, categorytypeid: c.categorytypeid })),
        };
    }

    if (action === 'finalisttextrules') {
        // AI Rules: program-wide finalist-text rules + per-type rules.
        const [types, jm] = await Promise.all([
            CategoryType.findAll({ where: { programid: program.programid, deleted: false }, order: [['orda', 'ASC']] }),
            program.judgingmodelid ? JudgingModel.findByPk(program.judgingmodelid) : null,
        ]);
        return {
            view: 'home/finalisttextrules',
            types:       types.map(t => t.toJSON()),
            globalRules: jm?.finalisttextrules || '',
        };
    }

    if (action === 'judgingguidelines') {
        // AI Rules: the comment-check guidelines + good/bad examples the AI uses.
        const jm = program.judgingmodelid ? await JudgingModel.findByPk(program.judgingmodelid) : null;
        return {
            view: 'home/judgingguidelines',
            guidelines:   jm?.commentguidelines   || '',
            examplesGood: jm?.commentexamplesgood || '',
            examplesBad:  jm?.commentexamplesbad  || '',
        };
    }

    if (action === 'finalisttextadmin') {
        // Editable list of accepted entries + their finalist text, grouped by category.
        const all = await getAllEntriesForProgram({ programId: program.programid });
        const accepted = all.filter(e => e.entryaccepted);
        const catMap = new Map();
        let blanks = 0;
        for (const e of accepted) {
            if (!catMap.has(e.categoryid)) {
                catMap.set(e.categoryid, { categoryid: e.categoryid, name: e.categoryname, entries: [] });
            }
            const ft = e.finalisttext || '';
            if (!ft) blanks++;
            catMap.get(e.categoryid).entries.push({
                entryid: e.entryid, entrantname: e.entrantname, finalisttext: ft,
            });
        }
        return { view: 'home/finalisttextadmin', cats: [...catMap.values()], total: accepted.length, blanks };
    }

    if (action === 'finalistlist') {
        // Finalists grouped by category, with an Excel export.
        const rows = await getFinalistsForProgram({ programId: program.programid });
        const catMap = new Map();
        for (const r of rows) {
            if (!catMap.has(r.categoryid)) {
                catMap.set(r.categoryid, { categoryid: r.categoryid, name: r.categoryname, finalists: [] });
            }
            catMap.get(r.categoryid).finalists.push({
                entryid:     r.entryid,
                name:        r.finalisttext || r.entrantname,
                entrantname: r.entrantname,
            });
        }
        return { view: 'home/finalistlist', cats: [...catMap.values()], total: rows.length };
    }

    if (action === 'reviewnominations') {
        // Admin summary of finalist-review nominations, grouped by category (lead
        // judge) → entry → nominators, to help organise the review meeting.
        const rows = await getReviewNominationsForProgram({ programId: program.programid });
        const catMap = new Map();
        for (const r of rows) {
            if (!catMap.has(r.categoryid)) {
                catMap.set(r.categoryid, {
                    categoryid: r.categoryid,
                    name:       r.categoryname,
                    leadName:   ((r.leadfirst || '') + ' ' + (r.leadlast || '')).trim() || '—',
                    entries:    new Map(),
                });
            }
            const cat = catMap.get(r.categoryid);
            if (!cat.entries.has(r.entryid)) {
                cat.entries.set(r.entryid, { entryid: r.entryid, name: r.finalisttext || r.entrantname, noms: [] });
            }
            cat.entries.get(r.entryid).noms.push({
                name:   ((r.nomfirst || '') + ' ' + (r.nomlast || '')).trim() || ('User ' + r.nominatorid),
                reason: r.reason,
            });
        }
        const cats = [...catMap.values()].map(c => ({ ...c, entries: [...c.entries.values()] }));
        return { view: 'home/reviewnominations', cats };
    }

    if (action === 'program') {
        const isEntriesOpenDefault  = !!program.entriesopendefault;
        const isPaymentsOpenDefault = !!program.paymentsopendefault;
        const isJudgingOpenDefault  = !!program.judgingopendefault;
        const [entryExceptions, paymentExceptions, judgingExceptions] = await Promise.all([
            Category.findAll({ where: { programid: program.programid, entriesopen: isEntriesOpenDefault ? 0 : 1 } }),
            User.findAll({     where: { programid: program.programid, paymentsopen: isPaymentsOpenDefault ? 0 : 1 } }),
            Category.findAll({ where: { programid: program.programid, judgingopen: isJudgingOpenDefault ? 0 : 1 } }),
        ]);
        return {
            view: 'home/program',
            entryExceptions, paymentExceptions, judgingExceptions,
            error: null,
            saved: req.query.saved === '1',
        };
    }

    if (action === 'discounts') {
        const { discountid: discountidParam, delete: deleteId } = req.query;
        if (deleteId) {
            await ProgramDiscount.destroy({ where: { discountid: parseInt(deleteId), programid: program.programid } });
            res.redirect('/home?action=discounts');
            return null;
        }
        const formatDate = (val) => {
            if (!val) return '';
            const d = new Date(val);
            if (isNaN(d)) return '';
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        };
        if (discountidParam) {
            const discount = await ProgramDiscount.findOne({ where: { discountid: parseInt(discountidParam), programid: program.programid } });
            if (!discount) { res.redirect('/home?action=discounts'); return null; }
            return {
                view: 'home/discount-edit',
                discount,
                formatDate,
                saved: req.query.saved === '1',
            };
        }
        const discounts = await ProgramDiscount.findAll({
            where: { programid: program.programid },
            order: [['type', 'ASC'], ['discountid', 'ASC']],
        });
        return {
            view:    'home/discounts',
            discounts,
            error:   req.query.error   || null,
            success: req.query.success === '1',
        };
    }

    if (action === 'category') {
        const categoryid     = req.query.categoryid     ? parseInt(req.query.categoryid)     : null;
        const deletecriteria = req.query.deletecriteria ? parseInt(req.query.deletecriteria) : null;

        if (deletecriteria && categoryid) {
            await Criteria.destroy({ where: { criteriaid: deletecriteria } });
            res.redirect(`/home?action=category&categoryid=${categoryid}`);
            return null;
        }

        let category = null, criteria = [], questions = [], eligibilities = [];
        if (categoryid) {
            category = await Category.findByPk(categoryid);
            if (!category) throw Object.assign(new Error('Category not found'), { status: 404 });

            const allQuestions = await Question.findAll({
                where: { programid: program.programid, deleted: false },
                order: [['orda', 'ASC'], ['questionid', 'ASC']],
            });
            const qLinks   = await CategoryQuestionLink.findAll({ where: { categoryid }, order: [['orda', 'ASC'], ['questionid', 'ASC']] });
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
            const eLinks   = await CategoryEligibilityLink.findAll({ where: { categoryid }, order: [['orda', 'ASC'], ['eligibilityid', 'ASC']] });
            const eLinkMap = new Map(eLinks.map(l => [l.eligibilityid, l]));
            const linkedEs   = eLinks.map(l => {
                const e = allEligibilities.find(e => e.eligibilityid === l.eligibilityid);
                return e ? { ...e.toJSON(), linked: true, linkOrda: l.orda } : null;
            }).filter(Boolean);
            const unlinkedEs = allEligibilities.filter(e => !eLinkMap.has(e.eligibilityid)).map(e => ({ ...e.toJSON(), linked: false }));
            eligibilities = [...linkedEs, ...unlinkedEs];

            criteria = await Criteria.findAll({ where: { categoryid }, order: [['orda', 'ASC'], ['criteriaid', 'ASC']] });
        }

        const categoryTypes = await CategoryType.findAll({
            where: { programid: program.programid, deleted: false }, order: [['orda', 'ASC']],
        });

        return {
            view:      'home/category',
            category:  category ? category.toJSON() : null,
            criteria, questions, eligibilities,
            categoryTypes: categoryTypes.map(t => t.toJSON()),
            isNew:     !categoryid,
            saved:     req.query.saved === '1',
        };
    }

    if (action === 'categories') {
        const cats = await getAllCategories({ programId: program.programid });
        return { view: 'home/categories', cats, currency };
    }

    if (action === 'questions') {
        const questionid = req.query.questionid ? parseInt(req.query.questionid) : null;
        const type       = req.query.type || '';
        if (questionid) {
            const question = await Question.findByPk(questionid);
            if (!question) throw Object.assign(new Error('Question not found'), { status: 404 });
            const [inputoptions, qLinks, allCategories, addressQuestions] = await Promise.all([
                InputOption.findAll({ where: { questionid, deleted: false }, order: [['orda', 'ASC']] }),
                CategoryQuestionLink.findAll({ where: { questionid } }),
                Category.findAll({ where: { programid: program.programid, deleted: false }, order: [['orda', 'ASC'], ['categoryid', 'ASC']] }),
                Question.findAll({ where: { programid: program.programid, questiontype: question.questiontype, inputtype: 'address', deleted: false }, order: [['orda', 'ASC']] }),
            ]);
            const linkedCatIds = new Set(qLinks.map(l => l.categoryid));
            return {
                view:             'home/question-edit',
                question:         question.toJSON(),
                inputoptions:     inputoptions.map(o => o.toJSON()),
                categories:       allCategories.map(c => ({ ...c.toJSON(), linked: linkedCatIds.has(c.categoryid) })),
                addressQuestions: addressQuestions.map(q => q.toJSON()).filter(q => q.orda < question.orda),
                isNew:            false,
                saved:            req.query.saved === '1',
                type,
            };
        }
        const questions = await getQuestionsByType({ programId: program.programid, questionType: type });
        return { view: 'home/questions', questions, type, success: req.query.success === '1' };
    }

    if (action === 'eligibility') {
        const eligibilityid = req.query.eligibilityid ? parseInt(req.query.eligibilityid) : null;
        if (eligibilityid) {
            const eligibility = await Eligibility.findByPk(eligibilityid);
            if (!eligibility) throw Object.assign(new Error('Eligibility rule not found'), { status: 404 });
            const links = await CategoryEligibilityLink.findAll({ where: { eligibilityid } });
            const categories = await Category.findAll({
                where: { programid: program.programid, deleted: false },
                order: [['orda', 'ASC'], ['categoryid', 'ASC']],
            });
            return {
                view:               'home/eligibility-edit',
                eligibility:        eligibility.toJSON(),
                categories:         categories.map(c => c.toJSON()),
                checkedCategoryIds: links.map(l => l.categoryid),
                isNew:              false,
                saved:              req.query.saved === '1',
            };
        }
        const eligibilities = await getEligibilitiesByProgram({ programId: program.programid });
        return { view: 'home/eligibility', eligibilities, success: req.query.success === '1' };
    }

    if (action === 'userpages') {
        const { userpageid: userpageidParam, delete: deleteId } = req.query;
        if (deleteId) {
            await UserPage.destroy({ where: { userpageid: parseInt(deleteId), programid: program.programid } });
            res.redirect('/home?action=userpages');
            return null;
        }
        if (userpageidParam) {
            const page = await UserPage.findOne({ where: { userpageid: parseInt(userpageidParam), programid: program.programid } });
            if (!page) { res.redirect('/home?action=userpages'); return null; }
            return {
                view:  'home/userpage-edit',
                page:  page.toJSON(),
                saved: req.query.saved === '1',
                error: req.query.error || null,
            };
        }
        const pages = await getUserPagesByProgram({ programId: program.programid });
        return { view: 'home/userpages', pages, success: req.query.success === '1' };
    }

    if (action === 'judges') {
        const judges = await getJudgesForProgram({ programId: program.programid, useSimplejudging: program.usesimplejudging });
        return { view: 'home/judges', judges };
    }

    if (action === 'allocatejudges') {
        const [cats, judges] = await Promise.all([
            getAllCategories({ programId: program.programid }),
            getJudgesForProgram({ programId: program.programid, useSimplejudging: program.usesimplejudging }),
        ]);
        const allEntries = await getAllEntriesForProgram({ programId: program.programid });
        const catData = await Promise.all(cats.map(async cat => {
            const catJudges  = await getJudgesForCategory({ categoryId: cat.categoryid });
            const links      = await getJudgeEntryLinksForCategory({ categoryId: cat.categoryid });
            const byEntry    = new Map();
            for (const l of links) {
                if (!byEntry.has(l.entryid)) byEntry.set(l.entryid, new Set());
                byEntry.get(l.entryid).add(l.userid);
            }
            const catEntries = allEntries
                .filter(e => e.categoryid === cat.categoryid && e.entryaccepted)
                .map(e => ({ ...e, assignedJudgeIds: byEntry.get(e.entryid) || new Set() }));
            return { ...cat, judges: catJudges, entries: catEntries };
        }));
        return { view: 'home/allocatejudges', cats: catData, allJudges: judges, translate };
    }

    if (action === 'emailjudges') {
        const judges = await getEnabledJudgesForProgram({ programId: program.programid, useSimplejudging: program.usesimplejudging });
        const host = req.get('host') || program.fqdn;
        const proto = req.get('x-forwarded-proto') || req.protocol;
        const loginUrl = `${proto}://${host}/${program.slug}/login`;
        return { view: 'home/emailjudges', judges, program, loginUrl, sent: req.query.sent === '1' };
    }

    if (action === 'judgecheck') {
        const cats         = await getAllCategories({ programId: program.programid });
        const judgingModel = await loadJudgingModel(program.judgingmodelid);
        const catData = await Promise.all(cats.map(async cat => {
            const catJudges = await getJudgesForCategory({ categoryId: cat.categoryid });
            const criteria  = await getCriteriaForCategory({ categoryId: cat.categoryid });
            const judgeData = await Promise.all(catJudges.map(async judge => {
                const entries    = await getEntriesAssignedToJudge({ userId: judge.userid });
                const catEntries = entries.filter(e => e.categoryid === cat.categoryid);
                const entryData  = await Promise.all(catEntries.map(async entry => {
                    const scores = (await Promise.all(
                        criteria.filter(c => c.weight).map(c =>
                            getScoreForEntryCriteriaJudge({ entryId: entry.entryid, criteriaId: c.criteriaid, userId: judge.userid })
                        )
                    )).filter(Boolean);
                    const comments = await getJudgeCommentsForEntryByJudge({ entryId: entry.entryid, userId: judge.userid });
                    return { ...entry, scores, comments };
                }));
                return { ...judge, entries: entryData };
            }));
            return { ...cat, judges: judgeData, criteria };
        }));
        return { view: 'home/judgecheck', cats: catData, judgingModel };
    }

    if (action === 'reviewcomments') {
        // Admin review queue — grouped by judge, showing ONLY comments flagged for
        // human review (reviewrequested). Per judge: batch-select entries to send
        // back for rework; per comment: clear the flag (optionally learn from it).
        const judges = await getJudgesForProgram({ programId: program.programid, useSimplejudging: program.usesimplejudging });
        const judgeData = await Promise.all(judges.map(async judge => {
            const entries = await getEntriesAssignedToJudge({ userId: judge.userid });
            const entryData = await Promise.all(entries.map(async entry => {
                const comments = (await getJudgeCommentsForEntryByJudge({ entryId: entry.entryid, userId: judge.userid }))
                    .filter(c => c.reviewrequested);
                if (!comments.length) return null;
                const link = await getJudgeEntryLink({ entryId: entry.entryid, userId: judge.userid });
                return {
                    entryid:       entry.entryid,
                    entrantname:   entry.finalisttext || entry.entrantname,
                    categoryname:  entry.categoryname,
                    comments,
                    commentreview: link && link.commentreview ? 1 : 0,
                };
            }));
            const flagged = entryData.filter(Boolean);
            return flagged.length
                ? { userid: judge.userid, firstname: judge.firstname, lastname: judge.lastname, entries: flagged }
                : null;
        }));
        return {
            view:    'home/reviewcomments',
            judges:  judgeData.filter(Boolean),
            sent:    req.query.sent === '1',
            cleared: req.query.cleared === '1',
        };
    }

    if (action === 'users') {
        const edituserid = req.query.edituserid ? parseInt(req.query.edituserid) : null;
        if (edituserid) {
            const targetUser = await User.findByPk(edituserid);
            if (!targetUser) { res.redirect('/home?action=users'); return null; }
            const [addresses, categories, credential] = await Promise.all([
                targetUser.credentialid ? loadAddressesForCredential(targetUser.credentialid) : [],
                (async () => {
                    const cats  = await Category.findAll({ where: { programid: program.programid, deleted: false }, order: [['orda', 'ASC'], ['categoryid', 'ASC']] });
                    const links = await JudgeCategoryLink.findAll({ where: { userid: edituserid } });
                    const linked = new Set(links.map(l => l.categoryid));
                    return cats.map(c => ({ ...c.toJSON(), judging: linked.has(c.categoryid) }));
                })(),
                targetUser.credentialid ? UserCredential.findByPk(targetUser.credentialid) : null,
            ]);
            const targetUserJson = targetUser.toJSON();
            if (credential) {
                targetUserJson.email             = credential.email             || '';
                targetUserJson.firstname         = credential.firstname         || '';
                targetUserJson.lastname          = credential.lastname          || '';
                targetUserJson.organisation      = credential.organisation      || '';
                targetUserJson.telephone         = credential.telephone         || '';
                targetUserJson.mobile            = credential.mobile            || '';
                targetUserJson.postaladdressid   = credential.postaladdressid   || null;
                targetUserJson.streetaddressid   = credential.streetaddressid   || null;
            }
            return {
                view:            'home/user-edit',
                targetUser:      targetUserJson,
                operator:        user,
                addresses:       addresses,
                categories,
                passwordRules:   PASSWORD_RULES,
                targetActivated: !credential || credential.activated,
                hasSetupToken:   !!(credential && credential.activationtoken),
                isAdmin:         true,
                error:           req.query.error || null,
                saved:           req.query.saved === '1',
                sent:            req.query.sent  === '1',
            };
        }
        const users = await getAllUsersForProgram({ programId: program.programid });
        // Flag users with a live session as "online". Sessions are rolling 8h
        // (reset each request), so expiry minus maxAge = last activity; treat
        // activity within the last 15 min as currently online.
        const SESSION_MAX_AGE = 8 * 60 * 60 * 1000;
        const ONLINE_WINDOW   = 15 * 60 * 1000;
        const now = Date.now();
        const activeSessions = await getActiveSessionUserIds({ programId: program.programid });
        const lastActiveById = new Map(
            activeSessions.map(s => [s.userid, new Date(s.expires).getTime() - SESSION_MAX_AGE])
        );
        for (const u of users) {
            const la = lastActiveById.get(u.userid);
            u.online = la != null && (now - la) < ONLINE_WINDOW;
        }
        return { view: 'home/users', users, payDefault: !!program.paymentsopendefault, success: req.query.success === '1' };
    }

    if (action === 'judge') {
        const judgeid  = req.query.judgeid  ? parseInt(req.query.judgeid)  : null;
        const categories = await Category.findAll({
            where: { programid: program.programid, deleted: false },
            order: [['orda', 'ASC'], ['categoryid', 'ASC']],
        });

        if (judgeid) {
            const judge = await User.findByPk(judgeid);
            if (!judge) { res.redirect('/home?action=judge'); return null; }
            const [linkedLinks, hjCats, credential] = await Promise.all([
                JudgeCategoryLink.findAll({ where: { userid: judgeid } }),
                Category.findAll({ where: { userid: judgeid, programid: program.programid, deleted: false } }),
                judge.credentialid ? UserCredential.findByPk(judge.credentialid) : null,
            ]);
            const linkedSet = new Set(linkedLinks.map(l => l.categoryid));
            const hjSet     = new Set(hjCats.map(c => c.categoryid));
            const judgeJson = judge.toJSON();
            // firstname/lastname/email live on UserCredential (migration 036).
            judgeJson.firstname = credential?.firstname || '';
            judgeJson.lastname  = credential?.lastname  || '';
            judgeJson.email     = credential?.email     || '';
            return {
                view: 'home/formJudge',
                judge: judgeJson,
                categories: categories.map(c => ({ ...c.toJSON(), linked: linkedSet.has(c.categoryid), headjudge: hjSet.has(c.categoryid) })),
                isNew: false, existingUser: null, prefill: null,
                error: req.query.error || null,
            };
        }

        // Conflict redirect from POST: ?conflict=1&existinguserid=X&email=…&firstname=…&lastname=…&cats=1,2,3
        let existingUser = null;
        if (req.query.conflict && req.query.existinguserid) {
            const eu = await User.findByPk(parseInt(req.query.existinguserid));
            if (eu) {
                existingUser = eu.toJSON();
                // firstname/lastname/email live on UserCredential (migration 036)
                const cred = eu.credentialid ? await UserCredential.findByPk(eu.credentialid) : null;
                existingUser.firstname = cred?.firstname || '';
                existingUser.lastname  = cred?.lastname  || '';
                existingUser.email     = cred?.email     || req.query.email || '';
            }
        }
        const prefill = (req.query.conflict || req.query.error)
            ? { firstname: req.query.firstname || '', lastname: req.query.lastname || '', email: req.query.email || '' }
            : null;
        const preselectedCats = req.query.cats
            ? new Set(req.query.cats.split(',').map(Number).filter(Boolean))
            : new Set();

        return {
            view: 'home/formJudge',
            judge: null,
            categories: categories.map(c => ({ ...c.toJSON(), linked: preselectedCats.has(c.categoryid), headjudge: false })),
            isNew: true, existingUser, prefill,
            error: req.query.error || null,
        };
    }

    if (action === 'activeusers') {
        const rows = await getActiveUsersReport({ programId: program.programid });
        return { view: 'home/activeusers', rows };
    }
    if (action === 'paidnotfinalised') {
        const rows = await getPaidNotFinalisedReport({ programId: program.programid });
        return { view: 'home/paidnotfinalised', rows };
    }
    if (action === 'finalisednotpaid') {
        const rows = await getFinalisedNotPaidReport({ programId: program.programid });
        return { view: 'home/finalisednotpaid', rows };
    }

    if (action === 'entriesbycategory') {
        const rows = await getEntriesByCategoryReport({ programId: program.programid });
        return { view: 'home/entriesbycategory', rows };
    }

    if (action === 'calcfinalscores') {
        const programId    = program.programid;
        const ignoreReady  = req.query.ignoreScoreReady === '1';
        const confirm      = req.query.confirm === '1';
        const wrote        = req.query.wrote === '1';
        const topN         = Math.max(1, parseInt(req.query.topN) || 5);
        const minRawScore  = parseFloat(req.query.minRawScore ?? 2.85);
        const wroteCount   = wrote ? parseInt(req.query.rowCount) || 0 : null;
        const wroteCatCount = wrote ? parseInt(req.query.catCount) || 0 : null;

        // Rank rows within each category by score descending.
        // Top N are finalists, but only if their raw weighted score meets the minimum.
        function addRanks(rows, n, minRaw) {
            const byCat = {};
            for (const r of rows) {
                if (!byCat[r.categoryid]) byCat[r.categoryid] = [];
                byCat[r.categoryid].push(r);
            }
            const result = [];
            for (const group of Object.values(byCat)) {
                group.sort((a, b) => b.finalscore - a.finalscore);
                let finalistCount = 0;
                for (let i = 0; i < group.length; i++) {
                    const meetsMin  = group[i].rawScore === null || group[i].rawScore >= minRaw;
                    const isFinalist = meetsMin && finalistCount < n;
                    if (isFinalist) finalistCount++;
                    result.push({ ...group[i], rank: i + 1, finalist: isFinalist, meetsMin });
                }
            }
            return result;
        }

        if (confirm && req.method === 'POST') {
            const rows  = await calcFinalScores(programId, { ignoreScoreReady: ignoreReady });
            const ranked = addRanks(rows, topN, minRawScore);

            // Delete existing FinalScore rows (CASCADE removes FinalScoreCriteria)
            await sequelize.query(`
                DELETE fs FROM FinalScore fs
                JOIN Category cat ON cat.categoryid = fs.categoryid
                WHERE cat.programid = ${programId}
            `);

            if (ranked.length) {
                const fsRows = ranked.map(({ criteriaBreakdown: _, rank: __, finalist: ___, meetsMin: ____, rawScore, ...r }) => ({ ...r, rawscore: rawScore }));
                const created = await FinalScore.bulkCreate(fsRows, { returning: true });
                const criteriaRows = [];
                for (let i = 0; i < created.length; i++) {
                    const { finalscoreid } = created[i];
                    for (const [criteriaid, { score, criterianame, weight }] of Object.entries(ranked[i].criteriaBreakdown)) {
                        criteriaRows.push({ finalscoreid, criteriaid: Number(criteriaid), criterianame, weight, score });
                    }
                }
                if (criteriaRows.length) await FinalScoreCriteria.bulkCreate(criteriaRows);

                // Set finalist flag on Entry rows
                const finalistIds    = ranked.filter(r => r.finalist).map(r => r.entryid).join(',');
                const nonFinalistIds = ranked.filter(r => !r.finalist).map(r => r.entryid).join(',');
                if (finalistIds)    await sequelize.query(`UPDATE Entry SET finalist = 1 WHERE entryid IN (${finalistIds})`);
                if (nonFinalistIds) await sequelize.query(`UPDATE Entry SET finalist = 0 WHERE entryid IN (${nonFinalistIds})`);
            }

            const writtenCatCount = new Set(ranked.map(r => r.categoryid)).size;
            const qs = `wrote=1&topN=${topN}&minRawScore=${minRawScore}&rowCount=${ranked.length}&catCount=${writtenCatCount}` + (ignoreReady ? '&ignoreScoreReady=1' : '');
            res.redirect(`/${program.slug}/home?action=calcfinalscores&${qs}`);
            return null;
        }

        // Dry run — compute, rank, and preview
        const rows    = await calcFinalScores(programId, { ignoreScoreReady: ignoreReady });
        const preview = addRanks(rows, topN, minRawScore);

        // Group by category for card layout
        const catMap = {};
        const categories = [];
        for (const r of preview) {
            if (!catMap[r.categoryid]) {
                catMap[r.categoryid] = { categoryid: r.categoryid, categoryname: r.categoryname, entries: [] };
                categories.push(catMap[r.categoryid]);
            }
            catMap[r.categoryid].entries.push(r);
        }

        return { view: 'home/calcfinalscores', categories, ignoreReady, wrote, topN, minRawScore,
            rowCount: wroteCount ?? rows.length, categoryCount: wroteCatCount ?? categories.length };
    }

    if (action === 'statefinalists') {
        // State/Territory finalists for the Best Event categories. Runs AFTER Calc Final
        // Scores (needs settled national finalists + scores). Preview → confirm/write,
        // mirroring Calc Final Scores. Writes Entry.statefinalist.
        const minRawScore = parseFloat(req.query.minRawScore ?? 2.85);
        const wrote       = req.query.wrote === '1';
        const recalc      = req.query.recalc === '1';

        // Confirm/write (from the preview), then redirect to the saved-list view.
        if (req.query.confirm === '1' && req.method === 'POST') {
            await ensureEventStates(program.programid);
            const { byEntry } = await computeStateFinalists(program.programid, { minRawScore });
            const written = await writeStateFinalists(program.programid, byEntry);
            res.redirect(`/${program.slug}/home?action=statefinalists&wrote=1&count=${written}`);
            return null;
        }

        // If state finalists are already written, show them straight from the DB (fast).
        // The "Re-calculate" button (recalc=1) forces a fresh preview + write.
        const saved = await loadSavedStateFinalists(program.programid);
        if (saved.finalistCount > 0 && !recalc) {
            return {
                view: 'home/statefinalists',
                categories: saved.categories, saved: true, wrote,
                finalistCount: saved.finalistCount,
                wroteCount: wrote ? (parseInt(req.query.count) || 0) : null,
            };
        }

        // Preview: compute from scratch (populates event states first).
        const ensured = await ensureEventStates(program.programid);
        const { categories, byEntry, unresolved } = await computeStateFinalists(program.programid, { minRawScore });
        return {
            view: 'home/statefinalists',
            categories, unresolved, minRawScore, ensured, saved: false,
            finalistCount: byEntry.size,
        };
    }

    if (action === 'stats') {
        const stats = await getEntryStats();
        return { view: 'home/stats', stats };
    }

    if (action === 'statsconfig') {
        if (req.method === 'POST') {
            const { task, statsprogramid, year, programid, opendate, esdate, closedate, lifetimecat } = req.body;
            if (task === 'delete') {
                await deleteStatsProgram({ statsprogramid: parseInt(statsprogramid) });
            } else {
                await upsertStatsProgram({
                    statsprogramid: statsprogramid ? parseInt(statsprogramid) : null,
                    year:           parseInt(year),
                    programid:      parseInt(programid),
                    opendate, esdate, closedate,
                    lifetimecat:    parseInt(lifetimecat) || 1,
                });
            }
            res.redirect(`/${req.program.slug}/home?action=statsconfig&saved=1`);
            return null;
        }
        const programs = await getStatsPrograms();
        return { view: 'home/statsconfig', programs, success: req.query.saved === '1' };
    }

    return undefined;
}
