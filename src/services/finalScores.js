// services/finalScores.js
// Port of getFinalScores.cgi — normalises judge scores and writes FinalScore rows.
//
// Algorithm constants (match Perl originals):
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

// Z-score transform: rescale `values` so mean → targetMean, sd → targetSD.
// If sd is 0, return all targetMean.
function scaleScores(scoreMap, targetMean = TARGET_MEAN, targetSD = TARGET_SD) {
    const entries = Object.keys(scoreMap);
    if (!entries.length) return scoreMap;
    const vals = Object.values(scoreMap);
    const mean = getMean(vals);
    const sd   = getSD(vals);

    const result = {};
    for (const [entryid, score] of Object.entries(scoreMap)) {
        if (sd === 0) {
            result[entryid] = targetMean;
        } else {
            result[entryid] = ((score - mean) / sd) * targetSD + targetMean;
        }
    }
    return result;
}

// ── Step 1: normalise each judge's raw scores to (85, 5) ─────────────────────
//
// judgeScores: { judgeId: { entryId: rawScore } }
// returns:     { judgeId: { entryId: normalisedScore } }

function getBaseScores(judgeScores) {
    const result = {};
    for (const [judgeId, entries] of Object.entries(judgeScores)) {
        result[judgeId] = scaleScores(entries);
    }
    return result;
}

// ── Step 2: inter-judge moderation ───────────────────────────────────────────
//
// For every (lead, judge) pair that shares >1 entry: transform ALL of judge's
// base scores so that judge's scores on the shared entries align to lead's scale.
// Accumulate one moderated version per lead; then average them.
// Judges with no overlap partners keep their base scores unchanged.
//
// baseScores: { judgeId: { entryId: score } }
// returns:    { judgeId: { entryId: moderatedScore } }

function moderateJudges(baseScores) {
    const judges = Object.keys(baseScores);
    // accumulators: { judgeId: [ {entryId: score}, ... ] }
    const accumulated = {};
    for (const j of judges) accumulated[j] = [];

    for (const leadId of judges) {
        const leadScores = baseScores[leadId];
        const leadEntries = Object.keys(leadScores);

        for (const judgeId of judges) {
            if (judgeId === leadId) continue;
            const judgeScores = baseScores[judgeId];

            // Shared entries
            const shared = leadEntries.filter(e => judgeId in baseScores && e in judgeScores);
            if (shared.length <= 1) continue;

            // Lead and judge scores on shared entries
            const leadVals  = shared.map(e => leadScores[e]);
            const judgeVals = shared.map(e => judgeScores[e]);

            const leadMean  = getMean(leadVals);
            const leadSD    = getSD(leadVals);
            const judgeMean = getMean(judgeVals);
            const judgeSD   = Math.max(getSD(judgeVals), MIN_SD);

            // Transform ALL of judge's scores to lead's scale
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
            // No overlap partners — keep base scores
            result[judgeId] = { ...baseScores[judgeId] };
        } else {
            // Average all moderated versions
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
//
// moderatedScores: { judgeId: { entryId: score } }
// returns:         { entryId: averageScore }

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
//
// judgeScores: { judgeId: { entryId: rawScore } }
// returns: { entryId: finalCriteriaScore }

function moderateAndCombine(judgeScores) {
    const base      = getBaseScores(judgeScores);
    const moderated = moderateJudges(base);
    const combined  = combineJudgeScores(moderated);
    return scaleScores(combined);
}

// ── Combine weighted criteria into a category score ───────────────────────────
//
// criteriaResults: { criteriaId: { entryId: score } }
// categoryWeights: { criteriaId: weight }
// returns:         { entryId: weightedScore }

function combineWeightedCriteria(criteriaResults, categoryWeights) {
    // Collect all entries
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
        if (totalWeight > 0) {
            result[entryId] = weightedSum / totalWeight;
        }
    }
    return result;
}

// ── Main calculation ──────────────────────────────────────────────────────────

import sequelize from '../config/sequelize.js';

export async function calcFinalScores(programId, { ignoreScoreReady = false } = {}) {
    const scoreReadyClause = ignoreScoreReady ? '' : 'AND cat.scoreready = 1';

    // SQL 1: raw scores — all scored entries in score-ready categories
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

    // SQL 2: category/criteria weights
    const [weightRows] = await sequelize.query(`
        SELECT cat.categoryid, cr.criteriaid, cr.weight
        FROM Category cat
        JOIN Criteria cr ON cr.categoryid = cat.categoryid
        WHERE cat.programid = ${programId}
          ${scoreReadyClause}
          AND cat.deleted = 0
          AND cr.weight > 0
    `);

    // SQL 3: entrant names for entries
    const [entrantRows] = await sequelize.query(`
        SELECT e.entryid, COALESCE(NULLIF(en.legalentity,''), en.name) AS entrantname
        FROM Entry e
        JOIN Entrant en ON en.entrantid = e.entrantid
        JOIN Category cat ON cat.categoryid = e.categoryid
        WHERE cat.programid = ${programId}
          AND e.deleted = 0
    `);

    // SQL 4: category names
    const [catNameRows] = await sequelize.query(`
        SELECT categoryid, name AS categoryname
        FROM Category
        WHERE programid = ${programId}
          AND deleted = 0
    `);

    // Build lookup maps
    // entrantByEntry: { entryId: entrantname }
    const entrantByEntry = {};
    for (const r of entrantRows) entrantByEntry[r.entryid] = r.entrantname;

    // catName: { categoryId: name }
    const catName = {};
    for (const r of catNameRows) catName[r.categoryid] = r.categoryname;

    // Organise score data: { criteriaId: { judgeId: { entryId: score } } }
    const byCriteria = {};
    for (const r of scoreRows) {
        const cid = r.criteriaid;
        const jid = r.userid;
        const eid = r.entryid;
        if (!byCriteria[cid]) byCriteria[cid] = {};
        if (!byCriteria[cid][jid]) byCriteria[cid][jid] = {};
        byCriteria[cid][jid][eid] = Number(r.score);
    }

    // Organise weights: { categoryId: { criteriaId: weight } }
    const catWeights = {};
    // Also: which criteria belong to which category
    const critToCategory = {};
    for (const r of weightRows) {
        const catId = r.categoryid;
        const crid  = r.criteriaid;
        if (!catWeights[catId]) catWeights[catId] = {};
        catWeights[catId][crid] = Number(r.weight);
        critToCategory[crid] = catId;
    }

    // ── Per-criteria moderation ────────────────────────────────────────────────
    // criteriaScores: { criteriaId: { entryId: score } }
    const criteriaScores = {};
    for (const [criteriaId, judgeScores] of Object.entries(byCriteria)) {
        criteriaScores[criteriaId] = moderateAndCombine(judgeScores);
    }

    // ── Combine weighted criteria per category ─────────────────────────────────
    // catResults: { categoryId: { entryId: score } }
    const catResults = {};
    for (const [categoryId, weights] of Object.entries(catWeights)) {
        const critResults = {};
        for (const criteriaId of Object.keys(weights)) {
            if (criteriaScores[criteriaId]) {
                critResults[criteriaId] = criteriaScores[criteriaId];
            }
        }
        if (Object.keys(critResults).length === 0) continue;
        const combined = combineWeightedCriteria(critResults, weights);
        catResults[categoryId] = scaleScores(combined);
    }

    // ── Build output rows ─────────────────────────────────────────────────────
    const output = [];
    for (const [categoryId, entryScores] of Object.entries(catResults)) {
        for (const [entryId, finalscore] of Object.entries(entryScores)) {
            output.push({
                categoryid:   Number(categoryId),
                entryid:      Number(entryId),
                categoryname: catName[categoryId] || '',
                entrantname:  entrantByEntry[entryId] || '',
                finalscore,
            });
        }
    }

    return output;
}
