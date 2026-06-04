// routes/recordScores.js
// Equivalent of recordScores.cgi
// Receives the judge score form POST from viewEntry and upserts Score + JudgeComment rows.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Entry            from '../models/Entry.js';
import Score            from '../models/Score.js';
import JudgeComment     from '../models/JudgeComment.js';
import JudgeEntryLink   from '../models/JudgeEntryLink.js';
import Category         from '../models/Category.js';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const body    = req.body;
        const entryid = body.entryid ? parseInt(body.entryid) : null;

        if (!entryid) return res.redirect('/home');

        // ── Auth: must be a judge assigned to this entry, or a lead judge / chairperson ──
        const entry    = await Entry.findByPk(entryid, { include: [{ model: Category, as: 'category' }] });
        if (!entry) return res.redirect('/home');

        const mejudge = await JudgeEntryLink.findAll({ where: { userid: user.userid, entryid } });
        const cat     = entry.category;
        const leadjudgereview =
            cat && (cat.finalistreview || cat.winnernomination) &&
            (cat.userid === user.userid || user.chairperson);

        if ((!user.judge || !mejudge.length) && !leadjudgereview) {
            return res.redirect('/home');
        }

        // ── Upsert scores and comments ────────────────────────────────────────
        for (const [key, val] of Object.entries(body)) {
            const parts = key.split('~');
            if (parts[0] === 'score') {
                const criteriaid = parseInt(parts[1]);
                const existing = await Score.findOne({
                    where: { entryid, criteriaid, userid: user.userid, deleted: false },
                });
                if (val === '' || val == null) {
                    if (existing) await existing.destroy();
                } else {
                    if (existing) {
                        await existing.update({ score: parseFloat(val) });
                    } else {
                        await Score.create({ entryid, criteriaid, userid: user.userid, score: parseFloat(val), deleted: false });
                    }
                }
            } else if (parts[0] === 'comment') {
                const type    = parts[1];
                const comment = val || '';
                const existing = await JudgeComment.findOne({
                    where: { entryid, type, userid: user.userid, deleted: false },
                });
                if (existing) {
                    await existing.update({ comment });
                } else {
                    await JudgeComment.create({ entryid, type, userid: user.userid, comment, deleted: false });
                }
            }
        }

        // ── Redirect ──────────────────────────────────────────────────────────
        if (body.submit === 'Save Comments') {
            return res.redirect('/home?action=reviewfinalists');
        }
        return res.redirect('/home?action=tojudge');

    } catch (err) { next(err); }
});

export default router;
