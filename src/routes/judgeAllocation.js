// routes/judgeAllocation.js
// Equivalent of judgeAllocation.cgi
// Admin-only POST handler for the judge allocation grid (home?action=allocatejudges).
// Replaces all JudgeEntryLinks for the program, updates head-judge category assignments,
// then soft-deletes orphaned scores/comments for judges no longer assigned to an entry.

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import sequelize        from '../config/sequelize.js';
import User             from '../models/User.js';
import Entry            from '../models/Entry.js';
import Category         from '../models/Category.js';
import JudgeEntryLink   from '../models/JudgeEntryLink.js';
import Score            from '../models/Score.js';
import JudgeComment     from '../models/JudgeComment.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.post('/', async (req, res, next) => {
    try {
        const program = req.program;
        const body    = req.body;
        const judgeValues = [].concat(body.judge || []);

        // The whole reconciliation is a full-snapshot replace (delete all program
        // links, re-insert what's ticked), so wrap it in a transaction — a failure
        // mid-way must not leave allocations partially wiped.
        await sequelize.transaction(async (t) => {
            // ── 1. Delete all existing JudgeEntryLinks for this program ──────
            const entries  = await Entry.findAll({
                where: { programid: program.programid },
                attributes: ['entryid'],
                transaction: t,
            });
            const entryIds = entries.map(e => e.entryid);
            if (entryIds.length) {
                await JudgeEntryLink.destroy({ where: { entryid: entryIds }, transaction: t });
            }

            // ── 2. Re-insert from form: judge[] values are "userid~entryid" ──
            for (const val of judgeValues) {
                const [u, e]  = String(val).split('~');
                const userid  = parseInt(u);
                const entryid = parseInt(e);
                if (userid && entryid) {
                    await JudgeEntryLink.create({ userid, entryid }, { transaction: t });
                }
            }

            // ── 3. Update head-judge (lead judge) category assignments ───────
            // Radio: hj~{categoryid} = userid (absent = no lead judge → null)
            const categories = await Category.findAll({
                where: { programid: program.programid, deleted: false },
                transaction: t,
            });
            for (const cat of categories) {
                const key = `hj~${cat.categoryid}`;
                const hjUserId = body[key] ? parseInt(body[key]) : null;
                if (hjUserId !== cat.userid) {
                    await cat.update({ userid: hjUserId || null }, { transaction: t });
                }
            }

            // ── 4. Soft-delete orphaned scores and comments ──────────────────
            const judges = await User.findAll({
                where: { programid: program.programid, judge: true, deleted: false },
                transaction: t,
            });
            for (const judge of judges) {
                const assignedLinks = await JudgeEntryLink.findAll({ where: { userid: judge.userid }, transaction: t });
                const assignedEntryIds = new Set(assignedLinks.map(l => l.entryid));

                const allScores = await Score.findAll({ where: { userid: judge.userid, deleted: false }, transaction: t });
                for (const score of allScores) {
                    if (!assignedEntryIds.has(score.entryid)) {
                        await score.update({ deleted: true }, { transaction: t });
                    }
                }

                const allComments = await JudgeComment.findAll({ where: { userid: judge.userid, deleted: false }, transaction: t });
                for (const comment of allComments) {
                    if (!assignedEntryIds.has(comment.entryid)) {
                        await comment.update({ deleted: true }, { transaction: t });
                    }
                }
            }
        });

        return res.redirect('/home');

    } catch (err) { next(err); }
});

export default router;
