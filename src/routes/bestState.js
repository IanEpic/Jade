// routes/bestState.js
// AJAX endpoint for the Calc Best State tool.
//   POST /beststate/refresh → look up the latest ABS populations (slow: web search),
//   recompute + save if anything changed, and report what happened as JSON. The page
//   then reloads to the saved snapshot with the appropriate banner.

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { STATES } from '../services/eventStates.js';
import {
    computeBestState, saveBestState, loadBestState,
    fetchAbsPopulations, DEFAULT_POPULATIONS,
} from '../services/bestState.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.post('/refresh', async (req, res, next) => {
    try {
        // If the admin hits Cancel, the browser aborts the request. Don't persist anything
        // for a cancelled lookup — track whether the client is still connected.
        let clientGone = false;
        res.on('close', () => { if (!res.writableFinished) clientGone = true; });

        const programId = req.program.programid;
        const stored    = await loadBestState(programId);
        const current   = stored?.snapshot?.populations || { ...DEFAULT_POPULATIONS };

        let fetched;
        try {
            fetched = await fetchAbsPopulations();
        } catch (err) {
            return res.json({ ok: false, error: err.message });
        }
        if (clientGone) return;     // cancelled during the (slow) lookup — leave saved data untouched

        const merged = { ...current };
        let changed = 0;
        for (const S of STATES) {
            if (fetched.populations[S] && fetched.populations[S] !== Number(current[S])) {
                merged[S] = fetched.populations[S]; changed++;
            }
        }
        const popMeta = { asof: fetched.asof, source: fetched.source, fetchedat: new Date().toISOString() };

        if (changed) {
            const result = await computeBestState(programId, { populations: merged });
            await saveBestState(programId, result, req.user?.userid, popMeta);
        } else if (stored) {
            // No change — keep the result but record that we checked (updates popMeta).
            await saveBestState(programId, { ...stored.snapshot, populations: current }, req.user?.userid, popMeta);
        }

        res.json({ ok: true, changed });
    } catch (err) { next(err); }
});

export default router;
