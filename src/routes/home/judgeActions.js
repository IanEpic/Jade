// routes/home/judgeActions.js
// Action handlers for judge-role /home?action= routes.
// Also handles actions that were incorrectly duplicated in the admin block
// (tojudge, reviewfinalists, wildcardnomination, finalistentries) — those
// admin copies were dead code since menu items are only shown when user.judge.
//
// Returns:
//   content object  → caller renders it
//   undefined       → action not matched here

import JudgingModel from '../../models/JudgingModel.js';
import { translate } from '../../services/translate.js';
import { buildWinnerNomination } from './winnerNomination.js';
import {
    getCatsOpenForReviewOrNomination,
    getCatsOpenForReviewByJudge,
    getFinalistsForProgram,
    getWildcardNominationsByJudge,
    getCriteriaForCategory,
    getScoresForEntryByJudge,
    getJudgeCommentsForEntryByJudge,
    getFinalScoresForEntries,
    getCategoriesLedByUser,
    getJudgesForCategory,
    getAllEntriesForProgram,
    getEntriesAssignedToJudge,
} from '../../queries/homeQueries.js';
import {
    getEntriesToBeJudgedByJudge,
    getEntriesForCommentReview,
    getNonFinalistsByJudgeAndCat,
    getEntriesNominatedForReviewByCat,
    getReviewNominationsForCat,
} from '../../queries/entryQueries.js';

async function loadJudgingModel(judgingmodelid) {
    if (!judgingmodelid) return {};
    const jm = await JudgingModel.findByPk(judgingmodelid);
    return jm ? jm.toJSON() : {};
}

export async function handleJudgeAction(action, req, res, program, user) {

    if (action === 'tojudge') {
        const entries      = await getEntriesToBeJudgedByJudge({ userId: user.userid });
        const judgingModel = await loadJudgingModel(program.judgingmodelid);
        const entryData    = await Promise.all(entries.map(async e => {
            const criteria = await getCriteriaForCategory({ categoryId: e.categoryid });
            const scores   = await getScoresForEntryByJudge({ entryId: e.entryid, userId: user.userid });
            const comments = await getJudgeCommentsForEntryByJudge({ entryId: e.entryid, userId: user.userid });
            return { ...e, criteria, scores, comments };
        }));
        return { view: 'home/tojudge', entries: entryData, judgingModel, user, translate };
    }

    if (action === 'revisecomments') {
        // Entries an admin has sent back to this judge for comment revision.
        // Opened in comments-only mode (scores read-only) via viewEntry.
        const entries = await getEntriesForCommentReview({ userId: user.userid });
        return { view: 'home/revisecomments', entries, user };
    }

    if (action === 'leadjudge') {
        // Lead-judge / chairperson oversight of their categories during judging:
        // per-judge progress grid, flagged comments, and links into entries.
        const isChair = !!user.chairperson;
        const cats = await getCategoriesLedByUser({ userId: user.userid, programId: program.programid, includeAll: isChair });
        const judgingModel = await loadJudgingModel(program.judgingmodelid);
        const catData = await Promise.all(cats.map(async cat => {
            const [catJudges, criteria] = await Promise.all([
                getJudgesForCategory({ categoryId: cat.categoryid }),
                getCriteriaForCategory({ categoryId: cat.categoryid }),
            ]);
            const flagged = [];
            const judgeData = await Promise.all(catJudges.map(async judge => {
                // Only the entries actually allocated to THIS judge in this category.
                const judgeEntries = (await getEntriesAssignedToJudge({ userId: judge.userid }))
                    .filter(e => e.categoryid === cat.categoryid);
                const entryData = await Promise.all(judgeEntries.map(async entry => {
                    const [scores, comments] = await Promise.all([
                        getScoresForEntryByJudge({ entryId: entry.entryid, userId: judge.userid }),
                        getJudgeCommentsForEntryByJudge({ entryId: entry.entryid, userId: judge.userid }),
                    ]);
                    for (const c of comments) {
                        if (c.reviewrequested) flagged.push({
                            judge:   judge.firstname + ' ' + judge.lastname,
                            entrant: entry.finalisttext || entry.entrantname,
                            type:    c.type,
                            comment: c.comment,
                            reason:  c.reviewreason,
                        });
                    }
                    return { entryid: entry.entryid, entrantname: entry.finalisttext || entry.entrantname, scores, comments };
                }));
                return { userid: judge.userid, firstname: judge.firstname, lastname: judge.lastname, entries: entryData };
            }));
            // Only judges who actually have entries allocated in this category.
            return { ...cat, judges: judgeData.filter(j => j.entries.length), criteria, flagged };
        }));
        return { view: 'home/leadjudge', cats: catData, judgingModel, isChair };
    }

    if (action === 'reviewfinalists') {
        const isChair = !!user.chairperson;
        let cats;
        if (isChair) {
            cats = await getCatsOpenForReviewOrNomination({ programId: program.programid });
        } else {
            // Categories the judge judged, PLUS categories they lead (a lead judge
            // may not be allocated entries in their own category but still needs to
            // see the finalists and any review nominations).
            const [judged, led] = await Promise.all([
                getCatsOpenForReviewByJudge({ userId: user.userid }),
                getCategoriesLedByUser({ userId: user.userid, programId: program.programid }),
            ]);
            const byId = new Map();
            for (const c of judged) byId.set(c.categoryid, c);
            for (const c of led) if (c.finalistreview && !byId.has(c.categoryid)) byId.set(c.categoryid, c);
            cats = [...byId.values()].sort((a, b) => (a.orda - b.orda) || (a.categoryid - b.categoryid));
        }
        const wildcardNoms = await getWildcardNominationsByJudge({ userId: user.userid });
        const catData = await Promise.all(cats.map(async cat => {
            const isLead       = cat.userid === user.userid || isChair;
            const finalists    = (await getFinalistsForProgram({ programId: program.programid }))
                .filter(e => e.categoryid === cat.categoryid);
            const nonFinalists = await getNonFinalistsByJudgeAndCat({ userId: user.userid, categoryId: cat.categoryid });
            const reviewNoms   = await getReviewNominationsForCat({ categoryId: cat.categoryid });
            // Group the roster by entry (several judges may nominate the same entry,
            // each with their own reason) and track which entries were nominated by
            // OTHER judges, so the nominate list can label them.
            const groupMap = new Map();
            const othersByEntry = {};
            for (const n of reviewNoms) {
                const nm = `${n.firstname || ''} ${n.lastname || ''}`.trim();
                if (!groupMap.has(n.entryid))
                    groupMap.set(n.entryid, { entryid: n.entryid, name: n.finalisttext || n.entrantname, noms: [] });
                groupMap.get(n.entryid).noms.push({ name: nm, reason: n.reason });
                if (n.userid !== user.userid)
                    (othersByEntry[n.entryid] = othersByEntry[n.entryid] || []).push(nm);
            }
            const reviewNomGroups = [...groupMap.values()];
            const entryIds     = [...finalists, ...nonFinalists].map(e => e.entryid);
            const finalScores  = isLead && entryIds.length ? await getFinalScoresForEntries({ entryIds }) : [];
            return { ...cat, isLead, finalists, nonFinalists, reviewNomGroups, othersByEntry, finalScores };
        }));
        return { view: 'home/reviewfinalists', cats: catData, user, wildcardNoms, translate, saved: req.query.saved === '1' };
    }

    if (action === 'nominatewinner') {
        return buildWinnerNomination({ program, user, saved: req.query.saved === '1' });
    }

    if (action === 'wildcardnomination') {
        const cats = user.chairperson
            ? await getCatsOpenForReviewOrNomination({ programId: program.programid })
            : await getCatsOpenForReviewByJudge({ userId: user.userid });
        const wildcardNoms = await getWildcardNominationsByJudge({ userId: user.userid });
        const catData = await Promise.all(cats.map(async cat => {
            const nonFinalists = await getNonFinalistsByJudgeAndCat({ userId: user.userid, categoryId: cat.categoryid });
            return { ...cat, nonFinalists };
        }));
        return { view: 'home/wildcardnomination', cats: catData, wildcardNoms, translate };
    }

    if (action === 'finalistentries') {
        const entries = await getFinalistsForProgram({ programId: program.programid });
        return { view: 'home/finalistentries', entries, translate };
    }

    if (action === 'tc')           return { view: 'home/judgetc',       program };
    if (action === 'judgetcerror') return { view: 'home/judgetc',       program, error: true };
    if (action === 'contacts')     return { view: 'home/judgecontacts', program };
    if (action === 'help')         return { view: 'home/judgehelp',     program };

    return undefined;
}
