// routes/simpleReview.js
// Equivalent of simpleReview.cgi
// Receives reviewer form POST from viewEntry: records accept/reject, score, comment, optional category reallocation.

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Entry        from '../models/Entry.js';
import JudgeComment from '../models/JudgeComment.js';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const body    = req.body;
        const entryid = body.entryid ? parseInt(body.entryid) : null;

        if (!user.reviewer || !entryid) return res.redirect('/home');

        const entry = await Entry.findByPk(entryid);
        if (!entry) return res.redirect('/home');

        // ── Accept/reject ─────────────────────────────────────────────────────
        let approvedbyreviewer = null;
        if (body.acceptreject === 'Accepted')  approvedbyreviewer = true;
        if (body.acceptreject === 'Rejected')  approvedbyreviewer = false;
        await entry.update({ approvedbyreviewer });

        // ── Score + comment ───────────────────────────────────────────────────
        const simplescore      = parseInt(body.simplescore) === -1 ? null : parseInt(body.simplescore) || null;
        const reviewercomment  = body.reviewercomment || '';

        const existing = await JudgeComment.findOne({
            where: { userid: user.userid, entryid, type: 'simplereviewcomment' },
        });
        if (existing) {
            await existing.update({ comment: reviewercomment, simplescore });
        } else {
            await JudgeComment.create({
                userid: user.userid, entryid, type: 'simplereviewcomment',
                comment: reviewercomment, simplescore, deleted: false,
            });
        }

        // ── Category reallocation ─────────────────────────────────────────────
        const reallocate = parseInt(body.reallocatecategory) || 0;
        if (reallocate !== 0) {
            const existingCatId = entry.categoryid;
            if (entry.originalcatid != null) {
                if (entry.originalcatid === reallocate) {
                    // Moving back to original — clear originalcatid
                    await entry.update({ categoryid: reallocate, originalcatid: null });
                } else {
                    await entry.update({ categoryid: reallocate });
                }
            } else {
                // First reallocation — preserve original
                await entry.update({ categoryid: reallocate, originalcatid: existingCatId });
            }
        }

        return res.redirect('/home?action=review');

    } catch (err) { next(err); }
});

export default router;
