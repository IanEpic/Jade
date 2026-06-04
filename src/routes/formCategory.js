// routes/formCategory.js
// Equivalent of formCategory.cgi

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Category             from '../models/Category.js';
import Question             from '../models/Question.js';
import Eligibility          from '../models/Eligibility.js';
import Criteria             from '../models/Criteria.js';
import CategoryQuestionLink from '../models/CategoryQuestionLink.js';
import CategoryEligibilityLink from '../models/CategoryEligibilityLink.js';
import { getPool, sql }     from '../config/database.js';

const NO_NEW_CRITERIA = 12;

const router = Router();
router.use(requireAuth);

router.use((req, res, next) => {
    if (!req.user.admin) return res.renderInShell('error', { message: 'You do not have permission to access this page.' });
    next();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCriteria(categoryid) {
    return Criteria.findAll({ where: { categoryid }, order: [['orda', 'ASC'], ['criteriaid', 'ASC']] });
}

async function getQuestions(programid, categoryid) {
    const questions = await Question.findAll({
        where: { programid, deleted: false },
        order: [['orda', 'ASC'], ['questionid', 'ASC']],
    });
    const links = await CategoryQuestionLink.findAll({ where: { categoryid } });
    const linkedIds = new Set(links.map(l => l.questionid));
    return questions.map(q => ({ ...q.toJSON(), linked: linkedIds.has(q.questionid) }));
}

async function getEligibilities(programid, categoryid) {
    const eligibilities = await Eligibility.findAll({
        where: { programid, deleted: false },
        order: [['orda', 'ASC'], ['eligibilityid', 'ASC']],
    });
    const links = await CategoryEligibilityLink.findAll({ where: { categoryid } });
    const linkedIds = new Set(links.map(l => l.eligibilityid));
    return eligibilities.map(e => ({ ...e.toJSON(), linked: linkedIds.has(e.eligibilityid) }));
}

// ── GET /formCategory ─────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;
        const categoryid = req.query.categoryid ? parseInt(req.query.categoryid) : null;

        // Delete action
        if (req.query.action === 'delete' && categoryid) {
            await Category.update({ deleted: true }, { where: { categoryid } });
            return res.redirect('/home?action=categories');
        }

        // Delete criteria action
        if (req.query.action === 'deletecriteria' && req.query.no) {
            await Criteria.destroy({ where: { criteriaid: parseInt(req.query.no) } });
            return res.redirect(`/formCategory?categoryid=${categoryid}`);
        }

        // Reorder action
        if (req.query.task === 'reorder') {
            const pool = await getPool();
            for (const [key, val] of Object.entries(req.query)) {
                const parts = key.split('#');
                if (parts[1]) {
                    await pool.request()
                        .input('orda', sql.Float, parseFloat(val))
                        .input('categoryid', sql.Int, parseInt(parts[1]))
                        .query('UPDATE Category SET orda = @orda WHERE categoryid = @categoryid');
                }
            }
            return res.redirect('/home?action=categories');
        }

        if (categoryid) {
            const category = await Category.findByPk(categoryid);
            if (!category) return next(Object.assign(new Error('Category not found'), { status: 404 }));
            const [criteria, questions, eligibilities] = await Promise.all([
                getCriteria(categoryid),
                getQuestions(program.programid, categoryid),
                getEligibilities(program.programid, categoryid),
            ]);
            return res.renderInShell('formCategory', {
                user, program, category, criteria, questions, eligibilities,
                noNewCriteria: NO_NEW_CRITERIA, isNew: false,
            });
        }

        // New category form — pre-check program defaults
        return res.renderInShell('formCategory', {
            user, program, category: null,
            criteria: [], questions: [], eligibilities: [],
            noNewCriteria: NO_NEW_CRITERIA, isNew: true,
        });

    } catch (err) { next(err); }
});

// ── POST /formCategory ────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;
        const body    = req.body;
        const bool    = (k) => body[k] ? 1 : 0;
        let categoryid = body.categoryid ? parseInt(body.categoryid) : null;

        if (body.submit === 'Preview Form' && categoryid) {
            return res.redirect(`/formEntry?categoryid=${categoryid}&preview=1`);
        }

        // ── New category ──
        if (!categoryid) {
            const category = await Category.create({
                programid:    program.programid,
                name:         body.name,
                description:  body.description,
                costex:       parseFloat(body.costex) || 0,
                gst:          parseFloat(body.gst)    || 0,
                entriesopen:  bool('entriesopen'),
                judgingopen:  bool('judgingopen'),
            });
            await category.update({ orda: category.categoryid });

            // Auto-link questions marked allcats
            const allcatQuestions = await Question.findAll({ where: { programid: program.programid, allcats: true } });
            for (const q of allcatQuestions) {
                await CategoryQuestionLink.create({ categoryid: category.categoryid, questionid: q.questionid });
            }
            return res.redirect('/home?action=categories');
        }

        // ── Edit category ──
        const category = await Category.findByPk(categoryid);
        await category.update({
            name:        body.name,
            description: body.description,
            costex:      parseFloat(body.costex) || 0,
            gst:         parseFloat(body.gst)    || 0,
            entriesopen: bool('entriesopen'),
            judgingopen: bool('judgingopen'),
        });

        // Eligibility links — replace all
        await CategoryEligibilityLink.destroy({ where: { categoryid } });
        for (const key of Object.keys(body)) {
            const [prefix, eligibilityid] = key.split('~');
            if (prefix === 'e' && eligibilityid) {
                await CategoryEligibilityLink.create({ categoryid, eligibilityid: parseInt(eligibilityid) });
            }
        }

        // Question links — replace all
        await CategoryQuestionLink.destroy({ where: { categoryid } });
        for (const key of Object.keys(body)) {
            const [prefix, questionid] = key.split('~');
            if (prefix === 'q' && questionid) {
                await CategoryQuestionLink.create({ categoryid, questionid: parseInt(questionid) });
            }
        }

        // Update existing criteria
        for (const key of Object.keys(body)) {
            const parts = key.split('~');
            // key format: ~~exist~field~criteriaid
            if (parts[2] === 'exist' && parts[3] && parts[4]) {
                const field     = parts[3];
                const criteriaid = parseInt(parts[4]);
                const allowed   = ['description', 'weight', 'orda'];
                if (allowed.includes(field)) {
                    await Criteria.update({ [field]: body[key] }, { where: { criteriaid } });
                }
            }
        }

        // New criteria
        for (let i = 0; i < NO_NEW_CRITERIA; i++) {
            const desc   = body[`~~new~desc~cr${i}`];
            const weight = body[`~~new~weight~cr${i}`];
            if (desc && desc.trim()) {
                const c = await Criteria.create({ categoryid, description: desc.trim(), weight: parseInt(weight) || 0 });
                await c.update({ orda: c.criteriaid });
            }
        }

        return res.redirect('/home?action=categories');

    } catch (err) { next(err); }
});

export default router;
