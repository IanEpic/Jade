// routes/judgeRework.js
// Admin-only. Two actions on flagged judge comments (Admin → Review Comments):
//   POST /            — batch send selected entries back to a judge for rework
//                       (sets commentreview=1) and emails the judge once, with
//                       the flag reasons and a link to their revise page.
//   POST /clear       — clear a single comment's review flag (AJAX). Optionally
//                       append the comment to the program guidelines as a good
//                       example so the AI check learns from it.

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import User            from '../models/User.js';
import UserCredential  from '../models/UserCredential.js';
import JudgeEntryLink   from '../models/JudgeEntryLink.js';
import Entry            from '../models/Entry.js';
import Entrant          from '../models/Entrant.js';
import Category         from '../models/Category.js';
import JudgeComment     from '../models/JudgeComment.js';
import JudgingModel     from '../models/JudgingModel.js';
import { mailHtml, parseSmtp } from '../services/mailer.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const typeLabel = (t) => t === 'excel' ? 'Excelled' : t === 'improve' ? 'Could improve' : 'Other';

// ── Batch send-back ─────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
    try {
        const program  = req.program;
        const userid   = req.body.userid ? parseInt(req.body.userid) : null;
        const entryids = [].concat(req.body.entryids || []).map(Number).filter(Boolean);
        if (!userid || !entryids.length) return res.redirect('/home?action=reviewcomments');

        // Flag each selected entry for rework.
        await JudgeEntryLink.update(
            { commentreview: 1 },
            { where: { userid, entryid: entryids } },
        );

        // Build per-entry feedback (entrant, category, flagged comment reasons).
        const lines = [];
        for (const entryid of entryids) {
            const entry = await Entry.findByPk(entryid);
            if (!entry) continue;
            const [entrant, category, comments] = await Promise.all([
                entry.entrantid ? Entrant.findByPk(entry.entrantid) : null,
                Category.findByPk(entry.categoryid),
                JudgeComment.findAll({ where: { userid, entryid, reviewrequested: true, deleted: false } }),
            ]);
            const name = entry.finalisttext || entrant?.name || `Entry ${entryid}`;
            const reasons = comments
                .filter(c => c.reviewreason)
                .map(c => `    • ${typeLabel(c.type)}: ${c.reviewreason}`);
            lines.push(`- ${name}${category ? ' (' + category.name + ')' : ''}:` + (reasons.length ? '\n' + reasons.join('\n') : ''));
        }

        // Notify the judge once.
        const judge = await User.findByPk(userid);
        if (judge) {
            const credential = judge.credentialid
                ? await UserCredential.findByPk(judge.credentialid)
                : await UserCredential.findOne({ where: { email: judge.email } });
            const email     = credential?.email || judge.email;
            const firstname = credential?.firstname || judge.firstname || 'Judge';
            const proto = req.get('x-forwarded-proto') || req.protocol;
            const host  = req.get('host') || program.fqdn;
            const link  = `${proto}://${host}/${program.slug}/home?action=revisecomments`;

            const msg =
                `Dear ${firstname}\n\n` +
                `Some of your comments for ${program.name} need revising before they can be released to entrants. ` +
                `Please review and update the comments for the following ${entryids.length === 1 ? 'entry' : 'entries'}:\n\n` +
                `${lines.join('\n\n')}\n\n` +
                `You can revise your comments here:\n${link}\n\n` +
                `Best Regards,\n\nThe ${program.name} Team`;

            if (email) {
                mailHtml({
                    to:      email,
                    subject: `${program.name} — judge comments to revise`,
                    html:    msg.replace(/\n/g, '<br>'),
                    from:    program.emailfromaddress,
                    ...parseSmtp(program.smtpserver),
                }).catch(err => console.warn(`Rework email failed for ${email}:`, err.message));
            }
        }

        return res.redirect('/home?action=reviewcomments&sent=1');
    } catch (err) { next(err); }
});

// ── Clear a flag (AJAX), optionally learning from a good comment ─────────────
router.post('/clear', async (req, res, next) => {
    try {
        const program   = req.program;
        const commentid = req.body.commentid ? parseInt(req.body.commentid) : null;
        const addExample = ['1', 'on', 'true'].includes(String(req.body.addexample));
        if (!commentid) return res.json({ ok: false });

        const comment = await JudgeComment.findByPk(commentid);
        if (!comment) return res.json({ ok: false });

        // Optionally teach the guideline checker with this good comment.
        if (addExample && comment.comment && program?.judgingmodelid) {
            const jm = await JudgingModel.findByPk(program.judgingmodelid);
            if (jm) {
                const label = comment.type === 'excel' ? 'excelled' : comment.type === 'improve' ? 'improve' : 'other';
                const addition = `\n\nExample of a good "${label}" comment:\n${comment.comment}`;
                await jm.update({ commentguidelines: (jm.commentguidelines || '') + addition });
            }
        }

        // Clear the flag and mark checked so it isn't re-flagged.
        await comment.update({ reviewrequested: false, reviewreason: null, reviewchecked: true });
        return res.json({ ok: true });
    } catch (err) { next(err); }
});

export default router;
