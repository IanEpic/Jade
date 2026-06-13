// routes/home/adminActions.js
// Action handlers for admin-only /home?action= routes.
//
// Returns:
//   content object  → caller renders it
//   null            → redirect already sent
//   undefined       → action not matched here

import Category                from '../../models/Category.js';
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
import JudgeCategoryLink       from '../../models/JudgeCategoryLink.js';
import UserCredential          from '../../models/UserCredential.js';
import JudgingModel            from '../../models/JudgingModel.js';
import { currency, PASSWORD_RULES } from '../../services/helpers.js';
import { translate }           from '../../services/translate.js';
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
    getAllUsersForProgram,
    getEntryStats,
    getStatsPrograms,
    upsertStatsProgram,
    deleteStatsProgram,
    getEntriesAssignedToJudge,
} from '../../queries/homeQueries.js';

async function loadJudgingModel(judgingmodelid) {
    if (!judgingmodelid) return {};
    const jm = await JudgingModel.findByPk(judgingmodelid);
    return jm ? jm.toJSON() : {};
}

export async function handleAdminAction(action, req, res, program, user) {

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

        return {
            view:      'home/category',
            category:  category ? category.toJSON() : null,
            criteria, questions, eligibilities,
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
        const catData = await Promise.all(cats.map(async cat => {
            const catJudges  = await getJudgesForCategory({ categoryId: cat.categoryid });
            const catEntries = (await getAllEntriesForProgram({ programId: program.programid }))
                .filter(e => e.categoryid === cat.categoryid && e.entryaccepted);
            return { ...cat, judges: catJudges, entries: catEntries };
        }));
        return { view: 'home/allocatejudges', cats: catData, allJudges: judges, translate };
    }

    if (action === 'emailjudges') {
        const judges = await getEnabledJudgesForProgram({ programId: program.programid, useSimplejudging: program.usesimplejudging });
        const host = program.fqdn || req.get('host');
        const loginUrl = `${req.protocol}://${host}/${program.slug}/login`;
        return { view: 'home/emailjudges', judges, program, loginUrl };
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

    if (action === 'users') {
        const edituserid = req.query.edituserid ? parseInt(req.query.edituserid) : null;
        if (edituserid) {
            const targetUser = await User.findByPk(edituserid);
            if (!targetUser) { res.redirect('/home?action=users'); return null; }
            const [addresses, categories, credential] = await Promise.all([
                Address.findAll({ where: { userid: edituserid }, order: [['addressid', 'ASC']] }),
                (async () => {
                    const cats  = await Category.findAll({ where: { programid: program.programid, deleted: false }, order: [['orda', 'ASC'], ['categoryid', 'ASC']] });
                    const links = await JudgeCategoryLink.findAll({ where: { userid: edituserid } });
                    const linked = new Set(links.map(l => l.categoryid));
                    return cats.map(c => ({ ...c.toJSON(), judging: linked.has(c.categoryid) }));
                })(),
                targetUser.credentialid ? UserCredential.findByPk(targetUser.credentialid) : null,
            ]);
            return {
                view:            'home/user-edit',
                targetUser:      targetUser.toJSON(),
                operator:        user,
                addresses:       addresses.map(a => a.toJSON()),
                categories,
                passwordRules:   PASSWORD_RULES,
                targetActivated: !credential || credential.activated,
                isAdmin:         true,
                error:           req.query.error || null,
                saved:           req.query.saved === '1',
            };
        }
        const users = await getAllUsersForProgram({ programId: program.programid });
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
            const [linkedLinks, hjCats] = await Promise.all([
                JudgeCategoryLink.findAll({ where: { userid: judgeid } }),
                Category.findAll({ where: { userid: judgeid, programid: program.programid, deleted: false } }),
            ]);
            const linkedSet = new Set(linkedLinks.map(l => l.categoryid));
            const hjSet     = new Set(hjCats.map(c => c.categoryid));
            return {
                view: 'home/formJudge',
                judge: judge.toJSON(),
                categories: categories.map(c => ({ ...c.toJSON(), linked: linkedSet.has(c.categoryid), headjudge: hjSet.has(c.categoryid) })),
                isNew: false, existingUser: null, prefill: null,
            };
        }

        // Conflict redirect from POST: ?conflict=1&existinguserid=X&email=…&firstname=…&lastname=…&cats=1,2,3
        const existingUser = req.query.conflict && req.query.existinguserid
            ? (await User.findByPk(parseInt(req.query.existinguserid)))?.toJSON() ?? null
            : null;
        const prefill = req.query.conflict
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
        };
    }

    if (action === 'activeusers')      return { view: 'home/activeusers' };
    if (action === 'paidnotfinalised') return { view: 'home/paidnotfinalised' };
    if (action === 'finalisednotpaid') return { view: 'home/finalisednotpaid' };

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
