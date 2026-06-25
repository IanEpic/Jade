// services/commentReviewJob.js
// Background job: audits judge comments for cross-entry problems the inline
// guideline check can't see — repetition across a judge's entries and comments
// that aren't specific to the entry. Flags offenders for ADMIN review
// (reviewrequested). Never blocks a judge.
//
// Each comment is checked once (reviewchecked); recordScores resets the flag
// when a comment is created/edited so edits get re-checked. Idempotent.
//
// Gated by the BACKGROUND_JOBS env var so it runs on ONE node only in prod
// (see startCommentReviewJob / app.js).

import JudgeComment from '../models/JudgeComment.js';
import { checkCommentContext } from './commentCheck.js';
import { isJobDirty, clearJobDirty, markJobDirty } from './jobState.js';
import {
    getUncheckedJudgeComments,
    getJudgeOtherComments,
    getEntryTextForContext,
} from '../queries/homeQueries.js';

const JOB = 'commentReview';
let running = false;

// Process a batch of unchecked comments. Returns { processed, flagged, fetched, limit }.
export async function runCommentReviewBatch({ limit = 25 } = {}) {
    if (running) return { skipped: true };
    running = true;
    let processed = 0, flagged = 0, fetched = 0;
    try {
        const comments = await getUncheckedJudgeComments({ limit });
        fetched = comments.length;
        for (const c of comments) {
            try {
                const [otherComments, entryContext] = await Promise.all([
                    getJudgeOtherComments({ userId: c.userid, type: c.type, excludeEntryId: c.entryid }),
                    getEntryTextForContext({ entryId: c.entryid }),
                ]);
                const { flag, reason } = await checkCommentContext({
                    comment: c.comment, type: c.type, otherComments, entryContext,
                });
                const update = { reviewchecked: true };
                // Only ever ADD a flag here — never clear an existing inline flag.
                if (flag) { update.reviewrequested = true; update.reviewreason = reason; flagged++; }
                await JudgeComment.update(update, { where: { commentid: c.commentid } });
                processed++;
            } catch (err) {
                console.warn(`commentReviewJob: comment ${c.commentid} failed:`, err.message);
                // Mark checked so one bad comment can't hot-loop the batch.
                await JudgeComment.update({ reviewchecked: true }, { where: { commentid: c.commentid } }).catch(() => {});
            }
        }
    } finally {
        running = false;
    }
    return { processed, flagged, fetched, limit };
}

// Start the recurring job. No-op unless BACKGROUND_JOBS=true (one node only).
// Each tick is gated by the dirty flag: if no comment has been created/edited since
// the last run, it does nothing (no DB scan, no AI). We clear the flag BEFORE
// processing (claim the work) so a comment saved mid-run re-arms it; and we re-arm
// ourselves if a full batch suggests more comments remain.
export function startCommentReviewJob({ intervalMs = 3 * 60 * 1000 } = {}) {
    if (process.env.BACKGROUND_JOBS !== 'true') return;
    console.log('[commentReviewJob] enabled — running every', Math.round(intervalMs / 1000), 's');
    setInterval(async () => {
        try {
            if (!(await isJobDirty(JOB))) return;     // nothing changed — skip
            await clearJobDirty(JOB);                  // claim the work
            const r = await runCommentReviewBatch();
            if (r.fetched >= r.limit) await markJobDirty(JOB);   // batch full — more may remain
            if (r.processed) console.log('[commentReviewJob]', JSON.stringify(r));
        } catch (e) {
            console.warn('[commentReviewJob] error:', e.message);
        }
    }, intervalMs);
}
