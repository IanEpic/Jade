// routes/judgeAllocation.js
// Equivalent of judgeAllocation.cgi
// Admin-only POST handler for the judge allocation grid (home?action=allocatejudges).
// Replaces all JudgeEntryLinks for the program, updates head-judge category assignments,
// then soft-deletes orphaned scores/comments for judges no longer assigned to an entry.

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import User             from '../models/User.js';
import Category         from '../models/Category.js';
import JudgeEntryLink   from '../models/JudgeEntryLink.js';
import Score            from '../models/Score.js';
import JudgeComment     from '../models/JudgeComment.js';
import { getPool, sql } from '../config/database.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = req.program;
        const body    = req.body;

        // ── 1. Delete all existing JudgeEntryLinks for this program ──────────
        // We need to join through Entry to filter by program — raw SQL is cleaner.
        const pool = await getPool();
        await pool.request()
            .input('programid', sql.Int, program.programid)
            .query(`
                DELETE jel FROM JudgeEntryLink jel
                INNER JOIN [Entry] e ON jel.entryid = e.entryid
                WHERE e.programid = @programid
            `);

        // ── 2. Re-insert from form: judge[] values are "userid~entryid" ──────
        const judgeValues = [].concat(body.judge || []);
        for (const val of judgeValues) {
            const parts  = val.split('~');
            const userid  = parseInt(parts[0]);
            const entryid = parseInt(parts[1]);
            if (userid && entryid) {
                await JudgeEntryLink.create({ userid, entryid });
            }
        }

        // ── 3. Update head-judge (lead judge) category assignments ───────────
        // Radio buttons: hj~{categoryid} = userid (or absent = no lead judge)
        const categories = await Category.findAll({
            where: { programid: program.programid, deleted: false },
        });
        for (const cat of categories) {
            const key = `hj~${cat.categoryid}`;
            const hjUserId = body[key] ? parseInt(body[key]) : null;
            if (hjUserId !== cat.userid) {
                await cat.update({ userid: hjUserId || null });
            }
        }

        // ── 4. Soft-delete orphaned scores and comments ──────────────────────
        // For each judge in the program, find their now-assigned entries,
        // then soft-delete scores/comments for any entries not in that set.
        const judges = await User.findAll({
            where: { programid: program.programid, judge: true, deleted: false },
        });
        for (const judge of judges) {
            const assignedLinks = await JudgeEntryLink.findAll({ where: { userid: judge.userid } });
            const assignedEntryIds = new Set(assignedLinks.map(l => l.entryid));

            const allScores = await Score.findAll({ where: { userid: judge.userid, deleted: false } });
            for (const score of allScores) {
                if (!assignedEntryIds.has(score.entryid)) {
                    await score.update({ deleted: true });
                }
            }

            const allComments = await JudgeComment.findAll({ where: { userid: judge.userid, deleted: false } });
            for (const comment of allComments) {
                if (!assignedEntryIds.has(comment.entryid)) {
                    await comment.update({ deleted: true });
                }
            }
        }

        return res.redirect('/home');

    } catch (err) { next(err); }
});

export default router;
