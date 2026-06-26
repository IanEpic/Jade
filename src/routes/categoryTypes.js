// routes/categoryTypes.js
// Admin: manage per-program category types + their generation rules, the program-wide
// finalist-text rules, and the assignment of categories to types. All AJAX.

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import CategoryType from '../models/CategoryType.js';
import Category from '../models/Category.js';
import JudgingModel from '../models/JudgingModel.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Program-wide finalist-text rules → JudgingModel.finalisttextrules
router.post('/global', async (req, res, next) => {
    try {
        if (!req.program.judgingmodelid) return res.json({ ok: false, error: 'no judging model' });
        await JudgingModel.update(
            { finalisttextrules: req.body.rules || '' },
            { where: { judgingmodelid: req.program.judgingmodelid } },
        );
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// Create or rename a category type (name only — rules are edited on the AI Rules page)
router.post('/type', async (req, res, next) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) return res.json({ ok: false, error: 'name required' });

        const id = parseInt(req.body.categorytypeid);
        if (id) {
            const t = await CategoryType.findByPk(id);
            if (!t || t.programid !== req.program.programid) return res.json({ ok: false });
            await t.update({ name });
            return res.json({ ok: true, categorytypeid: t.categorytypeid, name });
        }
        const max = await CategoryType.max('orda', { where: { programid: req.program.programid, deleted: false } });
        const created = await CategoryType.create({
            programid: req.program.programid, name, rules: '', orda: (max || 0) + 1, deleted: false,
        });
        res.json({ ok: true, categorytypeid: created.categorytypeid, name });
    } catch (err) { next(err); }
});

// Program-wide winner-citation rules (length, tone, etc.) → JudgingModel.citationrules
router.post('/citationrules', async (req, res, next) => {
    try {
        if (!req.program.judgingmodelid) return res.json({ ok: false, error: 'no judging model' });
        await JudgingModel.update(
            { citationrules: req.body.rules || '' },
            { where: { judgingmodelid: req.program.judgingmodelid } },
        );
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// Update a category type's generation rules (AI Rules → Finalist Text Rules)
router.post('/rules', async (req, res, next) => {
    try {
        const t = await CategoryType.findByPk(parseInt(req.body.categorytypeid));
        if (!t || t.programid !== req.program.programid) return res.json({ ok: false });
        await t.update({ rules: req.body.rules || '' });
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// Program-wide judging comment guidelines + good/bad examples → JudgingModel
router.post('/guidelines', async (req, res, next) => {
    try {
        if (!req.program.judgingmodelid) return res.json({ ok: false, error: 'no judging model' });
        await JudgingModel.update(
            {
                commentguidelines:   req.body.rules        || '',
                commentexamplesgood: req.body.examplesgood || '',
                commentexamplesbad:  req.body.examplesbad  || '',
            },
            { where: { judgingmodelid: req.program.judgingmodelid } },
        );
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// Set which headline category a type feeds its winners into (or clear it)
router.post('/feedsto', async (req, res, next) => {
    try {
        const t = await CategoryType.findByPk(parseInt(req.body.categorytypeid));
        if (!t || t.programid !== req.program.programid) return res.json({ ok: false });
        const feedsto = req.body.feedsto ? parseInt(req.body.feedsto) : null;
        if (feedsto) {
            const target = await Category.findByPk(feedsto);
            if (!target || target.programid !== req.program.programid) return res.json({ ok: false, error: 'bad target' });
        }
        await t.update({ feedsto });
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// Soft-delete a category type (and clear it from any categories using it)
router.post('/delete', async (req, res, next) => {
    try {
        const id = parseInt(req.body.categorytypeid);
        const t = await CategoryType.findByPk(id);
        if (!t || t.programid !== req.program.programid) return res.json({ ok: false });
        await t.update({ deleted: true });
        await Category.update({ categorytypeid: null }, { where: { categorytypeid: id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// Assign a category to a type (or clear it)
router.post('/assign', async (req, res, next) => {
    try {
        const categoryid     = parseInt(req.body.categoryid);
        const categorytypeid = req.body.categorytypeid ? parseInt(req.body.categorytypeid) : null;
        const cat = await Category.findByPk(categoryid);
        if (!cat || cat.programid !== req.program.programid) return res.json({ ok: false });
        await cat.update({ categorytypeid });
        res.json({ ok: true });
    } catch (err) { next(err); }
});

export default router;
