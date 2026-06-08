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
import {
    getCatsOpenForReviewOrNomination,
    getCatsOpenForReviewByJudge,
    getFinalistsForProgram,
    getWildcardNominationsByJudge,
    getCriteriaForCategory,
    getScoresForEntryByJudge,
    getJudgeCommentsForEntryByJudge,
    getFinalScoresForEntries,
} from '../../queries/homeQueries.js';
import {
    getEntriesToBeJudgedByJudge,
    getNonFinalistsByJudgeAndCat,
    getEntriesNominatedForReviewByCat,
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

    if (action === 'reviewfinalists') {
        const cats = user.chairperson
            ? await getCatsOpenForReviewOrNomination({ programId: program.programid })
            : await getCatsOpenForReviewByJudge({ userId: user.userid });
        const catData = await Promise.all(cats.map(async cat => {
            const finalists    = (await getFinalistsForProgram({ programId: program.programid }))
                .filter(e => e.categoryid === cat.categoryid);
            const nonFinalists = await getNonFinalistsByJudgeAndCat({ userId: user.userid, categoryId: cat.categoryid });
            const nominated    = await getEntriesNominatedForReviewByCat({ categoryId: cat.categoryid });
            const entryIds     = [...finalists, ...nonFinalists, ...nominated].map(e => e.entryid);
            const finalScores  = entryIds.length ? await getFinalScoresForEntries({ entryIds }) : [];
            return { ...cat, finalists, nonFinalists, nominated, finalScores };
        }));
        return { view: 'home/reviewfinalists', cats: catData, user, translate };
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
