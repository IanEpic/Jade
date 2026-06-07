// routes/formCategory.js
// Equivalent of formCategory.cgi

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Category             from '../models/Category.js';
import Question             from '../models/Question.js';
import InputOption          from '../models/InputOption.js';
import Criteria             from '../models/Criteria.js';
import CategoryQuestionLink from '../models/CategoryQuestionLink.js';
import CategoryEligibilityLink from '../models/CategoryEligibilityLink.js';
import Eligibility             from '../models/Eligibility.js';
import { getPool, sql }     from '../config/database.js';

const router = Router();
router.use(requireAuth);

router.use((req, res, next) => {
    if (!req.user.admin) return res.redirect('/home');
    next();
});

// ── GET /formCategory ─────────────────────────────────────────────────────────
// Category form is now served within the home framework at home?action=category.
// Only the delete action is kept here (destructive, no render needed).
router.get('/', async (req, res, next) => {
    try {
        const categoryid = req.query.categoryid ? parseInt(req.query.categoryid) : null;
        if (req.query.action === 'delete' && categoryid) {
            await Category.update({ deleted: true }, { where: { categoryid } });
            return res.redirect('/home?action=categories');
        }
        const qs = categoryid ? `?categoryid=${categoryid}` : '';
        return res.redirect(`/home?action=category${categoryid ? '&categoryid=' + categoryid : ''}`);
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
                name:             body.name,
                shortname:        body.shortname || null,
                description:      body.description,
                costex:           parseFloat(body.costex) || 0,
                gst:              parseFloat(body.gst)    || 0,
                entriesopen:      bool('entriesopen'),
                judgingopen:      bool('judgingopen'),
                scoreready:       bool('scoreready'),
                finalistreview:   bool('finalistreview'),
                wildcarddecision: bool('wildcarddecision'),
                winnernomination: bool('winnernomination'),
                adminonly:        bool('adminonly'),
            });
            await category.update({ orda: category.categoryid });

            // Auto-link questions marked allcats
            const allcatQuestions = await Question.findAll({ where: { programid: program.programid, allcats: true }, order: [['orda', 'ASC'], ['questionid', 'ASC']] });
            for (let i = 0; i < allcatQuestions.length; i++) {
                await CategoryQuestionLink.create({ categoryid: category.categoryid, questionid: allcatQuestions[i].questionid, orda: i + 1 });
            }
            return res.redirect(`/home?action=category&categoryid=${category.categoryid}&saved=1`);
        }

        // ── Edit category ──
        const category = await Category.findByPk(categoryid);
        await category.update({
            name:             body.name,
            shortname:        body.shortname || null,
            description:      body.description,
            costex:           parseFloat(body.costex) || 0,
            gst:              parseFloat(body.gst)    || 0,
            entriesopen:      bool('entriesopen'),
            judgingopen:      bool('judgingopen'),
            scoreready:       bool('scoreready'),
            finalistreview:   bool('finalistreview'),
            wildcarddecision: bool('wildcarddecision'),
            winnernomination: bool('winnernomination'),
            adminonly:        bool('adminonly'),
        });

        // Eligibility links — replace all, preserving submitted order via eord~ID
        await CategoryEligibilityLink.destroy({ where: { categoryid } });
        const eOrdaMap = {};
        for (const key of Object.keys(body)) {
            const [prefix, id] = key.split('~');
            if (prefix === 'eord') eOrdaMap[id] = parseInt(body[key]) || 0;
        }
        for (const key of Object.keys(body)) {
            const [prefix, eligibilityid] = key.split('~');
            if (prefix === 'e' && eligibilityid) {
                await CategoryEligibilityLink.create({ categoryid, eligibilityid: parseInt(eligibilityid), orda: eOrdaMap[eligibilityid] ?? 0 });
            }
        }

        // Question links — replace all, preserving submitted order via qord~ID
        await CategoryQuestionLink.destroy({ where: { categoryid } });
        const qOrdaMap = {};
        for (const key of Object.keys(body)) {
            const [prefix, id] = key.split('~');
            if (prefix === 'qord') qOrdaMap[id] = parseInt(body[key]) || 0;
        }
        for (const key of Object.keys(body)) {
            const [prefix, questionid] = key.split('~');
            if (prefix === 'q' && questionid) {
                await CategoryQuestionLink.create({ categoryid, questionid: parseInt(questionid), orda: qOrdaMap[questionid] ?? 0 });
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

        // New criteria — collect all submitted ~~new~desc~crN keys regardless of count
        const newCriteriaIndices = Object.keys(body)
            .filter(k => k.startsWith('~~new~desc~cr'))
            .map(k => parseInt(k.replace('~~new~desc~cr', '')))
            .sort((a, b) => a - b);
        for (const i of newCriteriaIndices) {
            const desc   = body[`~~new~desc~cr${i}`];
            const weight = body[`~~new~weight~cr${i}`];
            if (desc && desc.trim()) {
                const c = await Criteria.create({ categoryid, description: desc.trim(), weight: parseInt(weight) || 0 });
                await c.update({ orda: c.criteriaid });
            }
        }

        return res.redirect(`/home?action=category&categoryid=${categoryid}&saved=1`);

    } catch (err) { next(err); }
});

// ── POST /formCategory/create-eligibility ────────────────────────────────────
// AJAX: create a new eligibility rule and return {eligibilityid, eligibilityrule}

router.post('/create-eligibility', async (req, res, next) => {
    try {
        const program = req.user.program;
        const { eligibilityrule } = req.body;
        if (!eligibilityrule || !eligibilityrule.trim()) return res.status(400).json({ error: 'Rule text required' });
        const e = await Eligibility.create({
            programid:       program.programid,
            eligibilityrule: eligibilityrule.trim(),
            deleted:         false,
        });
        await e.update({ orda: e.eligibilityid });
        return res.json({ eligibilityid: e.eligibilityid, eligibilityrule: e.eligibilityrule });
    } catch (err) { next(err); }
});

// ── POST /formCategory/create-question ───────────────────────────────────────
// AJAX: create a new question and return {questionid, questiontext}

router.post('/create-question', async (req, res, next) => {
    try {
        const program = req.user.program;
        const { questiontext, questiontype, description, options } = req.body;
        if (!questiontext || !questiontext.trim()) return res.status(400).json({ error: 'Question text required' });
        const q = await Question.create({
            programid:    program.programid,
            questiontext: questiontext.trim(),
            questiontype: questiontype || 'text',
            description:  (description || '').trim() || null,
            deleted:      false,
        });
        await q.update({ orda: q.questionid });
        // Save options (newline-separated string from inline form)
        if (options) {
            const lines = options.split('\n').map(s => s.trim()).filter(Boolean);
            for (const line of lines) {
                const opt = await InputOption.create({ questionid: q.questionid, name: line, deleted: false });
                await opt.update({ orda: opt.inputoptionid });
            }
        }
        return res.json({ questionid: q.questionid, questiontext: q.questiontext });
    } catch (err) { next(err); }
});

export default router;
