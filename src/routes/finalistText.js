// routes/finalistText.js
// Admin: generate & edit finalist text for accepted entries.
//   POST /finalistText/generate { entryid }  → AI-generate + save, returns text
//   POST /finalistText/save     { entryid, text } → save an admin edit

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import Entry from '../models/Entry.js';
import Category from '../models/Category.js';
import Entrant from '../models/Entrant.js';
import CategoryType from '../models/CategoryType.js';
import JudgingModel from '../models/JudgingModel.js';
import { getFinalistTextExamples, getEntryResponsesForText } from '../queries/entryQueries.js';
import { generateFinalistText } from '../services/finalistText.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.post('/generate', async (req, res, next) => {
    try {
        const entryid = parseInt(req.body.entryid);
        if (!entryid) return res.json({ ok: false, error: 'no entry' });

        const entry = await Entry.findByPk(entryid, {
            include: [{ model: Category, as: 'category' }, { model: Entrant, as: 'entrant' }],
        });
        if (!entry || entry.programid !== req.program.programid) {
            return res.json({ ok: false, error: 'not found' });
        }

        const category  = entry.category?.name || '';
        // The organising body is the entrant's legal entity (company) when set,
        // otherwise the entrant name. Entrant.name is often the contact person.
        const entrant   = entry.entrant?.legalentity || entry.entrant?.name || '';
        const [examples, responses, type, jm] = await Promise.all([
            getFinalistTextExamples({ categoryName: category, excludeEntryId: entryid }),
            getEntryResponsesForText({ entryId: entryid }),
            entry.category?.categorytypeid ? CategoryType.findByPk(entry.category.categorytypeid) : null,
            req.program.judgingmodelid ? JudgingModel.findByPk(req.program.judgingmodelid) : null,
        ]);

        const text = await generateFinalistText({
            category, entrant, responses, examples,
            globalRules: jm?.finalisttextrules || '',
            typeName:    type?.name || '',
            typeRules:   type?.rules || '',
        });
        await entry.update({ finalisttext: text });
        res.json({ ok: true, entryid, text });
    } catch (err) { next(err); }
});

router.post('/save', async (req, res, next) => {
    try {
        const entryid = parseInt(req.body.entryid);
        if (!entryid) return res.json({ ok: false });
        const entry = await Entry.findByPk(entryid);
        if (!entry || entry.programid !== req.program.programid) return res.json({ ok: false });
        await entry.update({ finalisttext: (req.body.text || '').trim() });
        res.json({ ok: true, entryid });
    } catch (err) { next(err); }
});

export default router;
