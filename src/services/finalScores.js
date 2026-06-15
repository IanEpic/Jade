// services/finalScores.js
// Moderated scoring algorithm for awards judging.
//
// Algorithm constants:
const TARGET_MEAN = 85;
const TARGET_SD   = 5;
const MIN_SD      = 1;

// ── Maths helpers ─────────────────────────────────────────────────────────────

function getMean(values) {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function getSD(values) {
    if (values.length < 2) return 0;
    const mean = getMean(values);
    const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

// Z-score rescale: shift scoreMap so mean → targetMean, sd → targetSD.
// If sd is 0, all scores become targetMean.
function scaleScores(scoreMap, targetMean = TARGET_MEAN, targetSD = TARGET_SD) {
    const entries = Object.keys(scoreMap);
    if (!entries.length) return scoreMap;
    const vals = Object.values(scoreMap);
    const mean = getMean(vals);
    const sd   = getSD(vals);

    const result = {};
    for (const [entryid, score] of Object.entries(scoreMap)) {
        result[entryid] = sd === 0 ? targetMean : ((score - mean) / sd) * targetSD + targetMean;
    }
    return result;
}

// ── Step 1: normalise each judge's raw scores to (85, 5) ─────────────────────

function getBaseScores(judgeScores) {
    const result = {};
    for (const [judgeId, entries] of Object.entries(judgeScores)) {
        result[judgeId] = scaleScores(entries);
    }
    return result;
}

// ── Step 2: inter-judge moderation ───────────────────────────────────────────
//
// For every (lead, judge) pair with >1 shared entry: transform all of judge's
// base scores so their shared-entry scores align to lead's scale.
// Each judge accumulates one moderated version per lead, then averages them.
// Judges with no qualifying overlap partners keep their base scores.
//
// Self-pairs (lead == judge) are skipped — they are a no-op identity transform
// and only dilute the moderation signal from other judges.

function moderateJudges(baseScores) {
    const judges = Object.keys(baseScores);
    const accumulated = {};
    for (const j of judges) accumulated[j] = [];

    for (const leadId of judges) {
        const leadScores  = baseScores[leadId];
        const leadEntries = Object.keys(leadScores);

        for (const judgeId of judges) {
            if (judgeId === leadId) continue;

            const judgeScores = baseScores[judgeId];
            const shared = leadEntries.filter(e => e in judgeScores);
            if (shared.length <= 1) continue;

            const leadVals  = shared.map(e => leadScores[e]);
            const judgeVals = shared.map(e => judgeScores[e]);

            const leadMean  = getMean(leadVals);
            const leadSD    = Math.max(getSD(leadVals), MIN_SD);
            const judgeMean = getMean(judgeVals);
            const judgeSD   = Math.max(getSD(judgeVals), MIN_SD);

            const moderated = {};
            for (const [entryId, score] of Object.entries(judgeScores)) {
                moderated[entryId] = ((score - judgeMean) / judgeSD) * leadSD + leadMean;
            }
            accumulated[judgeId].push(moderated);
        }
    }

    const result = {};
    for (const judgeId of judges) {
        const versions = accumulated[judgeId];
        if (!versions.length) {
            result[judgeId] = { ...baseScores[judgeId] };
        } else {
            const allEntries = new Set(versions.flatMap(v => Object.keys(v)));
            const averaged = {};
            for (const entryId of allEntries) {
                const present = versions.filter(v => entryId in v);
                averaged[entryId] = getMean(present.map(v => v[entryId]));
            }
            result[judgeId] = averaged;
        }
    }
    return result;
}

// ── Step 3: average judges' scores per entry ──────────────────────────────────

function combineJudgeScores(moderatedScores) {
    const byEntry = {};
    for (const judgeScores of Object.values(moderatedScores)) {
        for (const [entryId, score] of Object.entries(judgeScores)) {
            if (!byEntry[entryId]) byEntry[entryId] = [];
            byEntry[entryId].push(score);
        }
    }
    const result = {};
    for (const [entryId, scores] of Object.entries(byEntry)) {
        result[entryId] = getMean(scores);
    }
    return result;
}

// ── Per-criteria pipeline ─────────────────────────────────────────────────────
// Returns per-entry scores scaled to (85, 5) — individually meaningful.

function moderateAndCombine(judgeScores) {
    const base      = getBaseScores(judgeScores);
    const moderated = moderateJudges(base);
    const combined  = combineJudgeScores(moderated);
    return scaleScores(combined);
}

// ── Combine weighted criteria into a category score ───────────────────────────
// Final score = weighted average of per-criteria scores.
// Because each criteria score is already scaled to (85, 5), this weighted
// average is the correct final score — no further rescaling is applied.

function combineWeightedCriteria(criteriaResults, categoryWeights) {
    const allEntries = new Set(
        Object.values(criteriaResults).flatMap(m => Object.keys(m))
    );

    const result = {};
    for (const entryId of allEntries) {
        let weightedSum = 0;
        let totalWeight = 0;
        for (const [criteriaId, scores] of Object.entries(criteriaResults)) {
            if (!(entryId in scores)) continue;
            const weight = categoryWeights[criteriaId] || 0;
            weightedSum += scores[entryId] * weight;
            totalWeight += weight;
        }
        if (totalWeight > 0) result[entryId] = weightedSum / totalWeight;
    }
    return result;
}

// ── Main calculation ──────────────────────────────────────────────────────────

import sequelize from '../config/sequelize.js';

export async function calcFinalScores(programId, { ignoreScoreReady = false } = {}) {
    const scoreReadyClause = ignoreScoreReady ? '' : 'AND cat.scoreready = 1';

    const [scoreRows] = await sequelize.query(`
        SELECT cr.criteriaid, s.userid, s.entryid, s.score, cat.categoryid
        FROM Category cat
        JOIN Entry e   ON e.categoryid  = cat.categoryid
        JOIN Score s   ON s.entryid     = e.entryid
        JOIN Criteria cr ON cr.criteriaid = s.criteriaid
        WHERE cat.programid = ${programId}
          ${scoreReadyClause}
          AND cr.weight > 0
          AND cat.deleted = 0
          AND e.deleted   = 0
          AND s.score    != 0
        ORDER BY cat.categoryid, cr.criteriaid, s.userid, s.entryid
    `);

    const [weightRows] = await sequelize.query(`
        SELECT cat.categoryid, cr.criteriaid, cr.weight,
               ISNULL(cr.name, cr.description) AS criterianame
        FROM Category cat
        JOIN Criteria cr ON cr.categoryid = cat.categoryid
        WHERE cat.programid = ${programId}
          ${scoreReadyClause}
          AND cat.deleted = 0
    `);

    const [entrantRows] = await sequelize.query(`
        SELECT e.entryid, COALESCE(NULLIF(en.legalentity,''), en.name) AS entrantname
        FROM Entry e
        JOIN Entrant en ON en.entrantid = e.entrantid
        JOIN Category cat ON cat.categoryid = e.categoryid
        WHERE cat.programid = ${programId}
          AND e.deleted = 0
    `);

    const [catNameRows] = await sequelize.query(`
        SELECT categoryid, name AS categoryname
        FROM Category
        WHERE programid = ${programId}
          AND deleted = 0
    `);

    const entrantByEntry = {};
    for (const r of entrantRows) entrantByEntry[r.entryid] = r.entrantname;

    const catName = {};
    for (const r of catNameRows) catName[r.categoryid] = r.categoryname;

    // { criteriaId: { judgeId: { entryId: score } } }
    const byCriteria = {};
    for (const r of scoreRows) {
        const cid = r.criteriaid, jid = r.userid, eid = r.entryid;
        if (!byCriteria[cid]) byCriteria[cid] = {};
        if (!byCriteria[cid][jid]) byCriteria[cid][jid] = {};
        byCriteria[cid][jid][eid] = Number(r.score);
    }

    // catWeights: weighted criteria only (used for scoring)
    // allCriteria: all criteria per category (used for display breakdown)
    const catWeights  = {};
    const allCriteria = {};
    const critToCategory = {};
    for (const r of weightRows) {
        const catId = r.categoryid, crid = r.criteriaid;
        const w = Number(r.weight) || 0;
        if (!allCriteria[catId]) allCriteria[catId] = {};
        allCriteria[catId][crid] = { weight: w || null, criterianame: r.criterianame || '' };
        critToCategory[crid] = catId;
        if (w > 0) {
            if (!catWeights[catId]) catWeights[catId] = {};
            catWeights[catId][crid] = { weight: w, criterianame: r.criterianame || '' };
        }
    }

    // ── Per-criteria moderation ────────────────────────────────────────────────
    // criteriaScores: { criteriaId: { entryId: score } }  — each scaled to (85,5)
    const criteriaScores = {};
    for (const [criteriaId, judgeScores] of Object.entries(byCriteria)) {
        criteriaScores[criteriaId] = moderateAndCombine(judgeScores);
    }

    // ── Raw weighted score per entry ───────────────────────────────────────────
    // Simple weighted average of judges' raw scores (no moderation/scaling).
    // Used to check entries meet a minimum quality threshold before finalist status.
    // { entryId: rawWeightedScore }
    const rawScoreByEntry = {};
    for (const [criteriaId, judgeScores] of Object.entries(byCriteria)) {
        const categoryId = critToCategory[criteriaId];
        if (!categoryId || !catWeights[categoryId]) continue;
        const weight = catWeights[categoryId][criteriaId]?.weight || 0;
        if (!weight) continue;

        // Per-entry mean raw score across all judges for this criteria
        const entryTotals = {};
        const entryCounts = {};
        for (const judgeScore of Object.values(judgeScores)) {
            for (const [entryId, score] of Object.entries(judgeScore)) {
                entryTotals[entryId] = (entryTotals[entryId] || 0) + score;
                entryCounts[entryId] = (entryCounts[entryId] || 0) + 1;
            }
        }
        for (const [entryId, total] of Object.entries(entryTotals)) {
            const meanRaw = total / entryCounts[entryId];
            if (!rawScoreByEntry[entryId]) rawScoreByEntry[entryId] = { weightedSum: 0, totalWeight: 0 };
            rawScoreByEntry[entryId].weightedSum  += meanRaw * weight;
            rawScoreByEntry[entryId].totalWeight  += weight;
        }
    }
    const rawScore = {};
    for (const [entryId, { weightedSum, totalWeight }] of Object.entries(rawScoreByEntry)) {
        rawScore[entryId] = totalWeight > 0 ? weightedSum / totalWeight : 0;
    }

    // ── Combine weighted criteria per category ─────────────────────────────────
    // Final score = weighted average of per-criteria scores (no further rescaling).
    const output = [];

    for (const [categoryId, weights] of Object.entries(catWeights)) {
        const critResults = {};
        const weightMap   = {};
        for (const [criteriaId, { weight }] of Object.entries(weights)) {
            if (criteriaScores[criteriaId]) {
                critResults[criteriaId] = criteriaScores[criteriaId];
                weightMap[criteriaId]   = weight;
            }
        }
        if (Object.keys(critResults).length === 0) continue;

        const finalScores = combineWeightedCriteria(critResults, weightMap);

        for (const [entryId, finalscore] of Object.entries(finalScores)) {
            const criteriaBreakdown = {};
            // Weighted criteria with scores
            for (const [criteriaId, scores] of Object.entries(critResults)) {
                if (entryId in scores) {
                    criteriaBreakdown[criteriaId] = {
                        score:        scores[entryId],
                        criterianame: weights[criteriaId].criterianame,
                        weight:       weights[criteriaId].weight,
                    };
                }
            }
            // Unweighted criteria — display only, no score
            for (const [criteriaId, info] of Object.entries(allCriteria[categoryId] || {})) {
                if (!criteriaBreakdown[criteriaId]) {
                    criteriaBreakdown[criteriaId] = {
                        score:        null,
                        criterianame: info.criterianame,
                        weight:       null,
                    };
                }
            }
            output.push({
                categoryid:        Number(categoryId),
                entryid:           Number(entryId),
                categoryname:      catName[categoryId] || '',
                entrantname:       entrantByEntry[entryId] || '',
                finalscore,
                rawScore:          rawScore[entryId] ?? null,
                criteriaBreakdown,
            });
        }
    }

    return output;
}
