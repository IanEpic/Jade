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
import JudgingModel     from '../models/JudgingModel.js';
import { checkComments } from '../services/commentCheck.js';
import { getEntryTextForContext } from '../queries/homeQueries.js';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const body    = req.body;
        const entryid = body.entryid ? parseInt(body.entryid) : null;

        const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest';
        if (!entryid) return isAjax ? res.json({ ok: false }) : res.redirect('/home');

        // ── Auth: must be a judge assigned to this entry, or a lead judge / chairperson ──
        const entry    = await Entry.findByPk(entryid, { include: [{ model: Category, as: 'category' }] });
        if (!entry) return res.redirect('/home');

        const mejudge = await JudgeEntryLink.findAll({ where: { userid: user.userid, entryid } });
        const cat     = entry.category;
        const leadjudgereview =
            cat && (cat.finalistreview || cat.winnernomination) &&
            (cat.userid === user.userid || user.chairperson);

        if ((!user.judge || !mejudge.length) && !leadjudgereview) {
            return isAjax ? res.json({ ok: false }) : res.redirect('/home');
        }

        // ── Save scores (always) ──────────────────────────────────────────────
        for (const [key, val] of Object.entries(body)) {
            const parts = key.split('~');
            if (parts[0] !== 'score') continue;
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
        }

        // ── Check comments, then save if they pass ────────────────────────────
        const excel   = body['comment~excel']   || '';
        const improve = body['comment~improve'] || '';
        const other   = body['comment~other']   || '';

        let commentsFailed = false;
        let reviewFlag   = false;   // borderline → save but flag for admin review
        let reviewReason = null;
        // The AI guideline check applies to entrant-facing comments. For a regular
        // judge a FAIL blocks. A lead judge / chairperson is never blocked — their
        // comment always saves, but a FAIL or REVIEW flags it for admin review.
        if (excel || improve || other) {
            const program = req.program;
            if (program?.judgingmodelid) {
                const jm = await JudgingModel.findByPk(program.judgingmodelid);
                if (jm?.commentguidelines) {
                    // Pass the entry's content so the check can flag generic,
                    // non-entry-specific comments (as REVIEW, not a block).
                    const entryContext = await getEntryTextForContext({ entryId: entryid });
                    const result = await checkComments({ excel, improve, other, guidelines: jm.commentguidelines, entryContext, examplesGood: jm.commentexamplesgood, examplesBad: jm.commentexamplesbad });
                    if (result.verdict === 'fail') {
                        if (leadjudgereview) {
                            reviewFlag   = true;    // never block lead/chair — flag for admin instead
                            reviewReason = result.message;
                        } else {
                            req.session.commentFeedback = { entryid, feedback: result.message };
                            commentsFailed = true;
                        }
                    } else if (result.verdict === 'review') {
                        reviewFlag   = true;        // does NOT block — proceeds as normal
                        reviewReason = result.message;
                    }
                }
            }
        }

        if (!commentsFailed) {
            for (const type of ['excel', 'improve', 'other']) {
                const comment = body[`comment~${type}`] || '';
                const existing = await JudgeComment.findOne({
                    where: { entryid, type, userid: user.userid, deleted: false },
                });
                // Set/clear the admin-review flag on each saved comment so a clean
                // resubmit clears a previously-flagged comment.
                if (existing) {
                    // reviewchecked:false → the background cross-entry job re-evaluates the new text.
                    await existing.update({ comment, reviewrequested: reviewFlag, reviewreason: reviewFlag ? reviewReason : null, reviewchecked: false });
                } else if (comment) {
                    await JudgeComment.create({ entryid, type, userid: user.userid, comment, deleted: false, reviewrequested: reviewFlag, reviewreason: reviewFlag ? reviewReason : null, reviewchecked: false });
                }
            }
            // Clear any rework flag now the judge has resubmitted acceptable comments.
            await JudgeEntryLink.update(
                { commentreview: 0 },
                { where: { userid: user.userid, entryid, commentreview: 1 } },
            );
            // Comments passed — drop any stored guideline feedback so it doesn't
            // re-appear next time this entry is opened (the AJAX path never reloads
            // the GET that would otherwise clear it).
            if (req.session.commentFeedback?.entryid === entryid) {
                delete req.session.commentFeedback;
            }
        }

        // ── Respond ───────────────────────────────────────────────────────────
        if (isAjax) {
            if (commentsFailed) return res.json({ ok: false, feedback: req.session.commentFeedback?.feedback });
            const redirect = body.submit === 'Save Comments' ? '/home?action=reviewfinalists' : '/home?action=tojudge';
            return res.json({ ok: true, redirect });
        }
        if (commentsFailed) return res.redirect(`/viewEntry?entryid=${entryid}`);
        if (body.submit === 'Save Comments') return res.redirect('/home?action=reviewfinalists');
        // Lead judge / chair adding their own comment during finalist review or
        // winner nomination — return to the relevant nomination list.
        if (leadjudgereview) {
            return res.redirect(cat.winnernomination
                ? '/home?action=nominatewinner'
                : '/home?action=reviewfinalists');
        }
        return res.redirect('/home?action=tojudge');

    } catch (err) { next(err); }
});

export default router;
