// routes/home/winnerNomination.js
// Shared content builder for the winner-nomination phase (action=nominatewinner).
//
// Roles:
//   • Lead judge  → editable form for the categories they lead (one winner each)
//   • Admin       → editable form for ALL categories in the phase (post-meeting changes)
//   • Chairperson → read-only view of every category's nominated winner, grouped by lead judge

import { translate } from '../../services/translate.js';
import {
    getWinnerNominationCats,
    getFinalistsForProgram,
    getFinalScoresForEntries,
} from '../../queries/homeQueries.js';

export async function buildWinnerNomination({ program, user, saved = false }) {
    const isAdmin = !!user.admin;
    const isChair = !!user.chairperson;
    // Admin / chair see all categories; a plain lead judge sees only the ones they lead.
    const leadUserId = (isAdmin || isChair) ? null : user.userid;
    const cats = await getWinnerNominationCats({ programId: program.programid, leadUserId });

    const allFinalists = await getFinalistsForProgram({ programId: program.programid });

    const catData = await Promise.all(cats.map(async cat => {
        const finalists = allFinalists.filter(e => e.categoryid === cat.categoryid);
        const entryIds  = finalists.map(e => e.entryid);
        const finalScores = entryIds.length ? await getFinalScoresForEntries({ entryIds }) : [];
        const scoreMap = {};
        finalScores.forEach(fs => { scoreMap[fs.entryid] = parseFloat(fs.finalscore); });
        finalists.sort((a, b) => (scoreMap[b.entryid] || 0) - (scoreMap[a.entryid] || 0));
        const nominated = finalists.find(e => e.nominated) || null;
        const leadName = ((cat.leadfirstname || '') + ' ' + (cat.leadlastname || '')).trim() || '—';
        // Lead judge can edit their own; admin can edit any. Chair never edits.
        const editable = !isChair && (isAdmin || cat.userid === user.userid);
        return {
            ...cat,
            finalists,
            scoreMap,
            nominatedId: nominated ? nominated.entryid : null,
            leadName,
            editable,
        };
    }));

    // Don't list categories that have no finalists to choose from.
    const withFinalists = catData.filter(c => c.finalists.length);

    // Chair (and only chair) gets the read-only grouped-by-lead view.
    const readOnly = isChair && !isAdmin;

    return { view: 'home/nominatewinner', cats: withFinalists, readOnly, isAdmin, isChair, user, translate, saved };
}
